#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ======= ตั้งค่า WiFi =======
const char* WIFI_SSID     = "YOUR_SSID";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";

// ======= ตั้งค่า Relay Server =======
// หลัง deploy relay ไปแล้ว ให้เปลี่ยนเป็น host ของคุณ
const char* RELAY_HOST = "your-relay.railway.app";
const int   RELAY_PORT = 443;          // 443 = WSS (HTTPS), 80 = WS
const char* RELAY_PATH = "/tunnel";

AsyncWebServer localServer(80);
WebSocketsClient tunnel;

String getContentType(const String& path) {
    if (path.endsWith(".html")) return "text/html; charset=utf-8";
    if (path.endsWith(".css"))  return "text/css";
    if (path.endsWith(".js"))   return "application/javascript";
    if (path.endsWith(".json")) return "application/json";
    if (path.endsWith(".png"))  return "image/png";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
    if (path.endsWith(".ico"))  return "image/x-icon";
    if (path.endsWith(".svg"))  return "image/svg+xml";
    return "text/plain";
}

// ส่ง response กลับไปหา relay ผ่าน WebSocket
void tunnelRespond(const String& id, int status, const String& contentType, const String& body) {
    StaticJsonDocument<256> meta;
    meta["type"]        = "response";
    meta["id"]          = id;
    meta["status"]      = status;
    meta["contentType"] = contentType;
    meta["size"]        = body.length();
    String metaStr;
    serializeJson(meta, metaStr);

    // ส่ง metadata + body คั่นด้วย newline
    tunnel.sendTXT(metaStr + "\n" + body);
}

// จัดการ request ที่เข้ามาผ่าน tunnel
void handleTunnelRequest(const String& id, const String& method, String path) {
    // API: สถานะอุปกรณ์
    if (path == "/api/status") {
        String body = "{\"status\":\"ok\",\"ip\":\"" + WiFi.localIP().toString() + "\","
                      "\"rssi\":" + String(WiFi.RSSI()) + ","
                      "\"uptime\":" + String(millis() / 1000) + "}";
        tunnelRespond(id, 200, "application/json", body);
        return;
    }

    // ไฟล์ปกติจาก LittleFS
    if (path == "/" || path == "") path = "/index.html";

    if (LittleFS.exists(path)) {
        File file = LittleFS.open(path, "r");
        String body = file.readString();
        file.close();
        tunnelRespond(id, 200, getContentType(path), body);
    } else {
        // 404
        String body = "<h1>404</h1><p>Not Found: " + path + "</p><a href='/'>Home</a>";
        if (LittleFS.exists("/404.html")) {
            File f = LittleFS.open("/404.html", "r");
            body = f.readString();
            f.close();
        }
        tunnelRespond(id, 404, "text/html; charset=utf-8", body);
    }
}

void onTunnelEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            Serial.println("[Tunnel] เชื่อมต่อกับ Relay สำเร็จ!");
            tunnel.sendTXT("{\"type\":\"hello\"}");
            break;

        case WStype_DISCONNECTED:
            Serial.println("[Tunnel] หลุดการเชื่อมต่อ กำลังต่อใหม่...");
            break;

        case WStype_TEXT: {
            String raw = String((char*)payload, length);
            int nl = raw.indexOf('\n');

            // รูปแบบ: JSON metadata อยู่บรรทัดแรก
            String jsonPart = (nl >= 0) ? raw.substring(0, nl) : raw;

            StaticJsonDocument<512> doc;
            if (deserializeJson(doc, jsonPart)) {
                Serial.println("[Tunnel] JSON parse error");
                return;
            }

            if (doc["type"] == "request") {
                String id     = doc["id"].as<String>();
                String method = doc["method"].as<String>();
                String path   = doc["path"].as<String>();
                Serial.printf("[Tunnel] %s %s\n", method.c_str(), path.c_str());
                handleTunnelRequest(id, method, path);
            }
            break;
        }

        case WStype_ERROR:
            Serial.println("[Tunnel] WebSocket error");
            break;

        default:
            break;
    }
}

void setupLocalServer() {
    localServer.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

    localServer.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* req) {
        String json = "{\"status\":\"ok\",\"ip\":\"" + WiFi.localIP().toString() + "\","
                      "\"rssi\":" + String(WiFi.RSSI()) + ","
                      "\"uptime\":" + String(millis() / 1000) + "}";
        req->send(200, "application/json", json);
    });

    localServer.onNotFound([](AsyncWebServerRequest* req) {
        if (LittleFS.exists("/404.html"))
            req->send(LittleFS, "/404.html", "text/html");
        else
            req->send(404, "text/plain", "404 Not Found");
    });

    localServer.begin();
    Serial.println("[Local] Web server เริ่มที่ port 80");
}

void connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("กำลังเชื่อมต่อ WiFi");
    unsigned long t = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) {
        delay(500);
        Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] เชื่อมต่อแล้ว!");
        Serial.println("[WiFi] Local IP: http://" + WiFi.localIP().toString());
    } else {
        Serial.println("\n[WiFi] เชื่อมต่อไม่ได้ ตรวจสอบ SSID/Password");
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);

    if (!LittleFS.begin(true)) {
        Serial.println("[FS] LittleFS mount failed!");
        return;
    }
    Serial.println("[FS] LittleFS ready");

    connectWiFi();
    setupLocalServer();

    // เชื่อมต่อ Relay ผ่าน WSS (TLS)
    tunnel.beginSSL(RELAY_HOST, RELAY_PORT, RELAY_PATH);
    tunnel.onEvent(onTunnelEvent);
    tunnel.setReconnectInterval(5000);
    Serial.println("[Tunnel] กำลังเชื่อมต่อ Relay...");
}

void loop() {
    tunnel.loop();

    // ต่อ WiFi ใหม่อัตโนมัติถ้าหลุด
    static unsigned long lastWifiCheck = 0;
    if (millis() - lastWifiCheck > 10000) {
        lastWifiCheck = millis();
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi] หลุด กำลังต่อใหม่...");
            WiFi.reconnect();
        }
    }
}

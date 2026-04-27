# ESP32 WebServer

ระบบ IoT Web Server สำหรับ ESP32 รองรับการควบคุม GPIO ผ่าน browser ทั้งใน LAN และจากทั่วโลกผ่าน Relay Server พร้อมระบบ User Authentication และ OTA Update

รองรับ 2 board:
- **`main`** — Arduino Nano ESP32 (ESP32-S3)
- **`esp32-dev`** — ESP32 38-pin DevKit (ESP32-WROOM-32)

---

## สถาปัตยกรรม

```
Browser (ทั่วโลก)
    │  HTTPS / WSS (production)
    ▼
Relay Server (Node.js) ─── Auth + Device Registry + GPIO Labels
    │  WebSocket
    ▼
ESP32 ─── GPIO Control + Local Web Server + OTA
    └── LittleFS: index.html, style.css, script.js
```

---

## Features

| Feature | รายละเอียด |
|---------|-----------|
| WiFi Provisioning | AP mode + Captive Portal ครั้งแรกที่เปิดเครื่อง |
| Multi-device | Relay รองรับ ESP32 หลายตัวพร้อมกัน |
| GPIO Control | อ่าน/เขียนทุกขา พร้อม mode INPUT/OUTPUT/PULLUP |
| GPIO Labels | ตั้งชื่อขาเองได้ เช่น "หลอดไฟห้องนั่งเล่น" |
| GPIO Filter | กรองขาตาม mode: OUTPUT / INPUT / HIGH |
| User Auth | Register/Login (JWT), Forgot/Reset Password ผ่าน Email |
| Device Pairing | ผูกอุปกรณ์ด้วย 6-digit Pairing Code |
| User Management | เชิญผู้ใช้พร้อมกำหนด Role (Owner / Editor / Viewer) |
| OTA Update | อัพโหลด Firmware และ Filesystem ผ่าน browser |
| Factory Reset | กด BOOT button ค้าง 5 วินาที |

---

## Branches

| Branch | Board | GPIO Pins |
|--------|-------|-----------|
| `main` | Arduino Nano ESP32 (ESP32-S3) | D2–D13, A0–A7 |
| `esp32-dev` | ESP32 38-pin DevKit (esp32dev) | GPIO2–GPIO39 |

```bash
# ใช้ Arduino Nano ESP32
git checkout main

# ใช้ ESP32 38-pin DevKit
git checkout esp32-dev
```

---

## โครงสร้างโปรเจค

```
nano_esp32_webserver/
├── src/
│   └── main.cpp          # ESP32 firmware
├── data/                 # Web files (อัพโหลดไปยัง LittleFS)
│   ├── index.html
│   ├── script.js
│   ├── style.css
│   └── 404.html
├── relay/                # Relay + Backend Server (Node.js)
│   ├── index.js          # Main server (WebSocket + HTTP routing)
│   ├── auth.js           # Auth routes + HTML pages
│   ├── db.js             # JSON file database
│   ├── .env.example      # Environment variables template
│   └── package.json
├── platformio.ini        # PlatformIO config
└── preview.js            # Local development preview server
```

---

## ความต้องการของระบบ

### ESP32 Firmware
- [PlatformIO](https://platformio.org/)

### Relay Server
- Node.js >= 18
- Hosting ที่รองรับ WebSocket เช่น [Railway](https://railway.app/), Render, VPS, Raspberry Pi

---

## การติดตั้งและใช้งาน

### 1. Clone โปรเจค

```bash
git clone https://github.com/khamphee3590/nano-esp32-webserver.git
cd nano-esp32-webserver

# เลือก branch ตาม board ที่ใช้
git checkout main        # Arduino Nano ESP32
git checkout esp32-dev   # ESP32 38-pin DevKit
```

### 2. ติดตั้ง Relay Server

```bash
cd relay
npm install
cp .env.example .env
# แก้ไข .env ใส่ค่าที่จำเป็น
```

**ค่าใน `.env`:**
```env
JWT_SECRET=your_random_secret_string_at_least_32_chars
BASE_URL=https://your-relay-domain.com

# SMTP สำหรับ reset password email (ใช้ Gmail App Password)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_app_password
```

**รัน relay server:**
```bash
node index.js   # แนะนำ — ใช้ได้ทุก OS
# หรือ
npm start       # อาจไม่ทำงานบน Windows PowerShell (execution policy)
```

### 3. Flash ESP32

```bash
# Build + Upload firmware
pio run --target upload

# Upload web files ไปยัง LittleFS
pio run --target uploadfs
```

> **หมายเหตุ**: Serial Monitor ต้องปิดก่อนรัน upload ทุกครั้ง

### 4. WiFi Provisioning (ครั้งแรก)

1. ESP32 จะเปิด Access Point ชื่อ `ESP32-XXXX`
2. เชื่อมต่อโทรศัพท์หรือคอมเข้า AP นั้น
3. Browser จะเปิด Setup Page อัตโนมัติ (หรือเปิดเอง `http://192.168.4.1`)
4. กรอก WiFi SSID, Password, Relay Host, ชื่ออุปกรณ์
5. กด "บันทึกและเชื่อมต่อ" — ESP32 จะ restart และเชื่อมต่อ WiFi

### 5. ผูกอุปกรณ์กับบัญชี

1. เปิด `https://your-relay-domain.com/register` สมัครบัญชี
2. Login → Dashboard → กด "+ เพิ่มอุปกรณ์"
3. ใส่ **Pairing Code** 6 หลักที่แสดงบน Setup Page ของ ESP32

---

## Local Testing (ไม่ต้อง deploy)

ทดสอบใน LAN โดยใช้ relay รันบนคอมเครื่องเดียวกัน

**1. หา IP ของคอม:**
```bash
ipconfig   # Windows
```

**2. รัน relay:**
```bash
cd relay && node index.js
```

**3. ตั้งค่า Relay Host ใน ESP32 Setup Page:**
```
172.20.10.4   ← IP ของคอมบน network เดียวกับ ESP32
```

**4. แก้ firmware ให้ใช้ WS แทน WSS** (local ไม่มี SSL):

ใน `src/main.cpp` เปลี่ยน:
```cpp
// Production (WSS port 443)
tunnel.beginSSL(cfg.relayHost, 443, "/tunnel");

// Local testing (WS port 3000)
tunnel.begin(cfg.relayHost, 3000, "/tunnel");
```

> กลับเป็น `beginSSL` เมื่อ deploy จริง

---

## URL Routes

### Relay Server

| URL | คำอธิบาย |
|-----|---------|
| `/` | Dashboard — รายการอุปกรณ์ทั้งหมด |
| `/login` | เข้าสู่ระบบ |
| `/register` | สมัครสมาชิก |
| `/forgot-password` | ขอ reset password |
| `/d/:deviceId/` | หน้าควบคุม GPIO ของอุปกรณ์นั้น |
| `/healthz` | Health check (public) |

### ESP32 Local API

| URL | Method | คำอธิบาย |
|-----|--------|---------|
| `/api/status` | GET | สถานะอุปกรณ์ (IP, RSSI, Uptime) |
| `/api/gpio` | GET | ค่าทุกขา GPIO |
| `/api/gpio/set` | POST | ตั้งค่า mode/value ของขา |
| `/ota` | POST | OTA firmware (`?type=fw`) หรือ filesystem (`?type=fs`) |

### Relay-managed API (ผ่าน /d/:deviceId/)

| URL | Method | คำอธิบาย |
|-----|--------|---------|
| `/api/gpio/labels` | GET/PUT | ชื่อ GPIO labels |
| `/api/device/info` | GET/PUT | ข้อมูลและชื่ออุปกรณ์ |
| `/api/device/users` | GET/POST | รายชื่อผู้ใช้, เชิญผู้ใช้ใหม่ |
| `/api/device/users/:id` | DELETE | ลบสิทธิ์ผู้ใช้ |

---

## GPIO ที่รองรับ

### Arduino Nano ESP32 (`main` branch)

| Arduino Pin | GPIO | Analog |
|------------|------|--------|
| D2–D7 | 5–10 | ✗ |
| D8–D13 | 17, 18, 21, 38, 47, 48 | ✗ |
| A0–A7 | 1–4, 11–14 | ✓ (0–4095) |

> **D13 (GPIO48)** = Built-in LED | **BOOT (GPIO0)** = Factory Reset

### ESP32 38-pin DevKit (`esp32-dev` branch)

| GPIO | Type | หมายเหตุ |
|------|------|---------|
| GPIO2 | Digital | Built-in LED บน DevKit ส่วนใหญ่ |
| GPIO4, 5, 12–19, 21–23 | Digital | ใช้งานทั่วไป |
| GPIO25, 26, 27 | Digital | **ไม่รองรับ analogRead ขณะ WiFi ทำงาน** (ADC2) |
| GPIO32, 33 | Analog+Digital | ADC1 — ใช้ analogRead ได้ |
| GPIO34, 35, 36, 39 | Analog **Input only** | ไม่รองรับ OUTPUT/PULLUP |
| GPIO6–11 | — | ต่อกับ Internal Flash **ห้ามใช้** |

> **BOOT (GPIO0)** = Factory Reset (ค้าง 5 วินาที)

---

## OTA Update

ต้องทำผ่าน **Local IP** เท่านั้น (ไม่ผ่าน relay)

1. เปิด browser ไปที่ `http://<ip-ของ-ESP32>/`
2. ไปที่ section **OTA Update**
3. เลือกไฟล์ `.bin` จาก PlatformIO build output:

| Board | Firmware | Filesystem |
|-------|----------|-----------|
| Arduino Nano ESP32 | `.pio/build/arduino_nano_esp32/firmware.bin` | `.pio/build/arduino_nano_esp32/littlefs.bin` |
| ESP32 DevKit | `.pio/build/esp32dev/firmware.bin` | `.pio/build/esp32dev/littlefs.bin` |

4. กด "อัพโหลด" — ESP32 จะ restart อัตโนมัติ

---

## Development Preview

จำลอง flow ทั้งหมดโดยไม่ต้องใช้ ESP32 จริง:

```bash
node preview.js
```

เปิด browser ที่ `http://localhost:8080`

| URL | คำอธิบาย |
|-----|---------|
| `http://localhost:8080/` | Mock relay dashboard |
| `http://localhost:8080/d/AABBCCDDEEFF/` | Mock ESP32 dashboard |
| Pairing Code จำลอง | `123456` |

Auth pages (**login, register** ฯลฯ) จะ bypass อัตโนมัติในโหมด preview

---

## User Roles

| Role | ดู GPIO | สั่ง GPIO | แก้ Labels | ตั้งค่าอุปกรณ์ | จัดการผู้ใช้ |
|------|---------|-----------|-----------|---------------|-------------|
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | ✓ | ✗ | ✗ |
| Viewer | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## Libraries ที่ใช้

### ESP32 Firmware
| Library | หน้าที่ |
|---------|---------|
| ESPAsyncWebServer | Async HTTP server |
| AsyncTCP | TCP layer สำหรับ AsyncWebServer |
| WebSockets | WebSocket client (tunnel ไป relay) |
| ArduinoJson | JSON parsing/serialization |
| Update.h | OTA update (built-in) |
| Preferences.h | NVS storage (built-in) |
| DNSServer.h | Captive portal DNS (built-in) |

### Relay Server
| Package | หน้าที่ |
|---------|---------|
| express | HTTP server |
| ws | WebSocket server |
| jsonwebtoken | JWT auth |
| bcryptjs | Password hashing |
| nodemailer | Reset password email |
| cookie-parser | Cookie parsing |
| dotenv | Environment variables |

---

## License

MIT

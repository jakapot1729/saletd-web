# SaleTD Web Portal (GitHub Pages)

ชุดไฟล์หน้าเว็บสำหรับอัปโหลดขึ้น Repository `https://github.com/jakapot1729/saletd-web` (GitHub Pages: `https://jakapot1729.github.io/saletd-web/`)

## คุณสมบัติ
- **รวมไว้หน้าแรก (`index.html`)**: คงข้อความแนะนำโปรแกรม **SaleTD** และลิงก์ **นโยบายความเป็นส่วนตัว (Privacy Policy)** เดิมไว้ครบถ้วน พร้อมปุ่มเข้าสู่ระบบด้วย Gmail
- **สิทธิ์เข้าดูแบบปลอดภัย (Gmail ตรงกับ Google Sheet)**:
  - ขอสิทธิ์ Google API แบบอ่านอย่างเดียว (`spreadsheets.readonly` + `drive.metadata.readonly`)
  - เข้าได้ทุก Gmail ที่เป็นเจ้าของ หรือถูก **Share** ไฟล์ Google Sheet ของร้าน (`SaleTD_รายงานยอดขาย_{ปี}`)
- **3 แท็บหลักสำหรับดูนอกร้าน:**
  1. **📊 Dashboard & คาดการณ์อนาคต**: ยอดขายจริง, กำไรขั้นต้น, คาดการณ์ 7/14/30 วันหน้า, กราฟรายวัน, ฤดูกาลวันขายดี, สินค้าคาดว่าจะขายดี, สินค้าควรเพิ่ม (พร้อมปุ่มคัดลอกรายการสั่งซื้อ) และสินค้าควรลด
  2. **🧾 รายการขาย**: ค้นหาบิลขาย ดูยอดสุทธิ และคลิกดูรายการสินค้าย่อยในแต่ละบิล
  3. **📦 Stock สินค้า**: ค้นหาสต๊อกคงเหลือ ต้นทุน/ราคาขาย สินค้าใกล้หมด และดูวันหมดอายุแยกล็อต

---

## ขั้นตอนติดตั้ง (3 ขั้นตอน)

### 1. สร้าง Web OAuth Client ID ใน Google Cloud Console
1. เข้า [Google Cloud Console](https://console.cloud.google.com/) เลือกโปรเจกต์เดียวกับ SaleTD
2. ไปที่ **APIs & Services → Credentials → + Create Credentials → OAuth client ID**
3. เลือก Application type = **Web application**
4. ช่อง **Authorized JavaScript origins** ใส่:
   ```text
   https://jakapot1729.github.io
   ```
5. คัดลอก **Client ID** (`xxxx.apps.googleusercontent.com`)
6. ไปที่ **OAuth consent screen → Test users** แล้วเพิ่ม **Gmail** ของคุณ และ Gmail อื่นๆ ที่จะให้เข้ามาดูข้อมูล (ถ้าแชร์ Sheet ให้คนอื่นดูด้วย ต้องใส่เมลนั้นใน Test users ด้วยครับ)

### 2. ใส่ค่าใน `config.js`
เปิดไฟล์ `config.js` แล้วแก้ค่า `GOOGLE_WEB_CLIENT_ID` ให้เป็น Client ID ที่เพิ่งสร้าง และตรวจว่า `PRIVACY_POLICY_URL` ตรงกับชื่อไฟล์นโยบายความเป็นส่วนตัวเดิมใน Repo `saletd-web` ของคุณ (ค่าเริ่มต้นคือ `privacy.html`)

### 3. อัปโหลดขึ้น GitHub Repo `jakapot1729/saletd-web`
นำไฟล์ทั้ง 4 ไฟล์ (`index.html`, `style.css`, `app.js`, `config.js`) ไปวางทับใน Repo `saletd-web` (โดยเก็บไฟล์ Privacy Policy เดิมไว้เหมือนเดิม) แล้ว Push ขึ้น GitHub — เปิดใช้งานได้ที่ `https://jakapot1729.github.io/saletd-web/` ทันทีครับ

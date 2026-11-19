// ตั้งค่าการเชื่อมต่อสำหรับหน้าเว็บ SaleTD Web Portal (GitHub Pages)
// 1) นำ OAuth 2.0 Client ID ประเภท "Web application" จาก Google Cloud Console มาวางด้านล่าง
// 2) Authorized JavaScript origins ใน Google Cloud Console ต้องใส่เป็น: https://jakapot1729.github.io
window.SALETD_WEB_CONFIG = {
    GOOGLE_WEB_CLIENT_ID: "107044279593-s988s5l9tpc24dnm57mmlgntj7kai76l.apps.googleusercontent.com",
    SPREADSHEET_NAME_PREFIX: "SaleTD_รายงานยอดขาย_",
    // แก้ชื่อไฟล์ให้ตรงกับไฟล์นโยบายความเป็นส่วนตัวเดิมใน Repo saletd-web (ถ้าชื่ออื่น)
    PRIVACY_POLICY_URL: "privacy.html",
    DEVELOPER_EMAIL: "jakapot1729@gmail.com"
};

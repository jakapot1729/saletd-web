(() => {
    "use strict";

    const CFG = window.SALETD_WEB_CONFIG || {};
    const DEFAULT_CLIENT_ID_PLACEHOLDER = "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com";
    const LOCAL_CLIENT_ID_KEY = "saletd_web_client_id";
    const SCOPES = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
    ].join(" ");

    const state = {
        accessToken: null,
        user: null,
        files: [],
        activeSpreadsheetId: null,
        rawData: null,
        forecast: null
    };

    const $ = (id) => document.getElementById(id);

    // =========================================================================
    // INIT & CONFIG
    // =========================================================================
    document.addEventListener("DOMContentLoaded", () => {
        applyStaticLinks();
        refreshClientIdSetupUi();
        bindEvents();
    });

    function applyStaticLinks() {
        const privacyUrl = CFG.PRIVACY_POLICY_URL || "privacy.html";
        const devEmail = CFG.DEVELOPER_EMAIL || "jakapot1729@gmail.com";
        $("privacyLinkMain").href = privacyUrl;
        $("privacyLinkFooter").href = privacyUrl;
        $("devEmailLink").href = `mailto:${devEmail}`;
        $("devEmailLink").textContent = devEmail;
        $("footerEmailLink").href = `mailto:${devEmail}`;
        $("footerEmailLink").textContent = devEmail;
    }

    function getConfiguredClientId() {
        const fromCfg = (CFG.GOOGLE_WEB_CLIENT_ID || "").trim();
        if (fromCfg && fromCfg !== DEFAULT_CLIENT_ID_PLACEHOLDER) {
            return fromCfg;
        }
        return (localStorage.getItem(LOCAL_CLIENT_ID_KEY) || "").trim();
    }

    function refreshClientIdSetupUi() {
        const fromCfg = (CFG.GOOGLE_WEB_CLIENT_ID || "").trim();
        const isPlaceholder = !fromCfg || fromCfg === DEFAULT_CLIENT_ID_PLACEHOLDER;
        if (isPlaceholder) {
            $("clientIdSetupBox").classList.remove("hidden");
            $("txtManualClientId").value = (localStorage.getItem(LOCAL_CLIENT_ID_KEY) || "").trim();
        } else {
            $("clientIdSetupBox").classList.add("hidden");
        }
    }

    function bindEvents() {
        $("btnSaveManualClientId").addEventListener("click", () => {
            const val = $("txtManualClientId").value.trim();
            if (!val || !val.includes(".apps.googleusercontent.com")) {
                showAuthStatus("กรุณาใส่ Client ID ที่ลงท้ายด้วย .apps.googleusercontent.com ให้ถูกต้อง", "warn");
                return;
            }
            localStorage.setItem(LOCAL_CLIENT_ID_KEY, val);
            showAuthStatus("บันทึก Web Client ID ในเบราว์เซอร์เครื่องนี้เรียบร้อย กดปุ่มเข้าสู่ระบบด้วย Gmail ได้เลยครับ", "info");
        });

        $("btnGoogleSignIn").addEventListener("click", () => startGoogleLogin("select_account"));
        $("btnSwitchAccount").addEventListener("click", () => startGoogleLogin("select_account"));
        $("btnSignOut").addEventListener("click", signOut);
        $("btnRefreshSheet").addEventListener("click", () => loadSelectedSpreadsheet());

        $("btnLoadManualSheet").addEventListener("click", () => {
            const raw = $("txtManualSheetId").value.trim();
            const sheetId = extractSpreadsheetId(raw);
            if (!sheetId) {
                showAuthStatus("ลิงก์หรือ Spreadsheet ID ไม่ถูกต้อง", "warn");
                return;
            }
            loadManualSpreadsheetById(sheetId);
        });

        $("selSheetFile").addEventListener("change", (e) => {
            state.activeSpreadsheetId = e.target.value;
            loadSelectedSpreadsheet();
        });

        document.querySelectorAll(".tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => switchPortalTab(btn.dataset.tab));
        });

        $("selHistoryDays").addEventListener("change", recomputeAndRenderDashboard);
        $("selForecastDays").addEventListener("change", recomputeAndRenderDashboard);
        $("txtDashFilter").addEventListener("input", renderDashboardTablesOnly);
        $("btnCopyReorder").addEventListener("click", copyReorderList);

        $("txtSalesSearch").addEventListener("input", renderSalesTable);
        $("selSalesRange").addEventListener("change", renderSalesTable);
        $("selSalesStatus").addEventListener("change", renderSalesTable);

        $("txtStockSearch").addEventListener("input", renderStockTable);
        $("selStockFilter").addEventListener("change", renderStockTable);

        $("btnCloseModal").addEventListener("click", closeModal);
        $("detailModal").addEventListener("click", (e) => {
            if (e.target === $("detailModal")) closeModal();
        });
    }

    // =========================================================================
    // GOOGLE IDENTITY SERVICES (GIS) AUTHENTICATION
    // =========================================================================
    function startGoogleLogin(promptMode) {
        const clientId = getConfiguredClientId();
        if (!clientId) {
            showAuthStatus("กรุณาใส่ Web Client ID ก่อน (ใน config.js หรือช่องตั้งค่าด้านล่าง)", "warn");
            return;
        }

        if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
            showAuthStatus("กำลังโหลดระบบ Google Login อยู่ กรุณารอสักครู่แล้วกดใหม่อีกครั้งครับ", "warn");
            return;
        }

        showAuthStatus("กำลังเปิดหน้าต่างเลือกบัญชี Gmail...", "info");
        $("btnGoogleSignIn").disabled = true;

        try {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: SCOPES,
                callback: async (resp) => {
                    $("btnGoogleSignIn").disabled = false;
                    if (resp.error) {
                        showAuthStatus(`เข้าสู่ระบบไม่สำเร็จ: ${resp.error_description || resp.error}`, "danger");
                        return;
                    }
                    state.accessToken = resp.access_token;
                    await onSignedInAsync();
                },
                error_callback: (err) => {
                    $("btnGoogleSignIn").disabled = false;
                    showAuthStatus(`ไม่สามารถเปิดหน้าล็อกอิน Google ได้ (${err?.type || "popup_closed"})`, "warn");
                }
            });

            tokenClient.requestAccessToken({ prompt: promptMode || "select_account" });
        } catch (err) {
            $("btnGoogleSignIn").disabled = false;
            showAuthStatus(`เกิดข้อผิดพลาดในการเรียก Google OAuth: ${err.message}`, "danger");
        }
    }

    async function onSignedInAsync() {
        try {
            showAuthStatus("กำลังยืนยันบัญชี Gmail และค้นหาไฟล์ Google Sheet ของร้าน...", "info");
            const userResp = await googleApiFetch("https://www.googleapis.com/oauth2/v3/userinfo");
            state.user = userResp;
            updateUserHeaderUi(userResp);

            const prefix = CFG.SPREADSHEET_NAME_PREFIX || "SaleTD_รายงานยอดขาย_";
            const q = encodeURIComponent(`mimeType='application/vnd.google-apps.spreadsheet' and name contains '${prefix}' and trashed=false`);
            const fields = encodeURIComponent("files(id,name,modifiedTime,shared,owners(emailAddress,displayName))");
            const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=20&includeItemsFromAllDrives=true&supportsAllDrives=true`;

            const driveResp = await googleApiFetch(driveUrl);
            state.files = driveResp.files || [];

            if (state.files.length === 0) {
                $("manualSheetAccessBox").classList.remove("hidden");
                showAuthStatus(
                    `บัญชี ${userResp.email || "-"} ล็อกอินสำเร็จ แต่ไม่พบไฟล์ "${prefix}..." ใน Google Drive ของบัญชีนี้ (หรือยังไม่ได้รับแชร์ Sheet จากร้าน)`,
                    "warn"
                );
                return;
            }

            $("manualSheetAccessBox").classList.add("hidden");
            populateSpreadsheetSelector(state.files);
            state.activeSpreadsheetId = choosePreferredSheetId(state.files);
            $("selSheetFile").value = state.activeSpreadsheetId;

            await loadSelectedSpreadsheet();
            $("loginView").classList.add("hidden");
            $("portalView").classList.remove("hidden");
        } catch (err) {
            if (err.status === 401) {
                handleSessionExpired();
                return;
            }
            showAuthStatus(`ไม่สามารถเชื่อมต่อข้อมูล Google Drive/Sheet ได้: ${err.message}`, "danger");
        }
    }

    async function loadManualSpreadsheetById(sheetId) {
        if (!state.accessToken) {
            showAuthStatus("กรุณากดเข้าสู่ระบบด้วย Gmail ก่อนครับ", "warn");
            return;
        }
        try {
            showAuthStatus("กำลังตรวจสอบสิทธิ์การเข้าถึง Sheet ที่ระบุ...", "info");
            const meta = await googleApiFetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}?fields=id,name,modifiedTime,shared,owners(emailAddress,displayName)&supportsAllDrives=true`
            );
            state.files = [meta];
            populateSpreadsheetSelector(state.files);
            state.activeSpreadsheetId = meta.id;
            await loadSelectedSpreadsheet();
            $("loginView").classList.add("hidden");
            $("portalView").classList.remove("hidden");
        } catch (err) {
            showAuthStatus(
                `บัญชี ${state.user?.email || ""} ไม่มีสิทธิ์เปิด Sheet นี้ (${err.message}) กรุณาตรวจสอบการแชร์สิทธิ์ใน Google Sheet`,
                "danger"
            );
        }
    }

    function choosePreferredSheetId(files) {
        const curYearName = `${CFG.SPREADSHEET_NAME_PREFIX || "SaleTD_รายงานยอดขาย_"}${new Date().getFullYear()}`;
        const exact = files.find((f) => f.name === curYearName);
        return (exact || files[0]).id;
    }

    function populateSpreadsheetSelector(files) {
        const sel = $("selSheetFile");
        sel.innerHTML = "";
        for (const f of files) {
            const opt = document.createElement("option");
            opt.value = f.id;
            const ownerEmail = f.owners && f.owners[0]?.emailAddress;
            const sharedNote = f.shared && ownerEmail && state.user?.email && ownerEmail.toLowerCase() !== state.user.email.toLowerCase()
                ? ` (แชร์จาก ${ownerEmail})`
                : "";
            opt.textContent = `${f.name}${sharedNote}`;
            sel.appendChild(opt);
        }
    }

    function updateUserHeaderUi(user) {
        $("userEmailText").textContent = user.email || user.name || "Google Account";
        if (user.picture) {
            $("userAvatar").src = user.picture;
            $("userAvatar").classList.remove("hidden");
        } else {
            $("userAvatar").classList.add("hidden");
        }
        $("userBadge").classList.remove("hidden");
        $("btnSwitchAccount").classList.remove("hidden");
        $("btnSignOut").classList.remove("hidden");
    }

    function signOut() {
        if (state.accessToken && window.google?.accounts?.oauth2?.revoke) {
            try {
                window.google.accounts.oauth2.revoke(state.accessToken, () => {});
            } catch {
                // ignore revoke error
            }
        }
        state.accessToken = null;
        state.user = null;
        state.files = [];
        state.activeSpreadsheetId = null;
        state.rawData = null;
        state.forecast = null;

        $("portalView").classList.add("hidden");
        $("loginView").classList.remove("hidden");
        $("userBadge").classList.add("hidden");
        $("btnSwitchAccount").classList.add("hidden");
        $("btnSignOut").classList.add("hidden");
        $("hdrStoreName").textContent = "SaleTD";
        showAuthStatus("ออกจากระบบเรียบร้อยแล้ว", "info");
    }

    function handleSessionExpired() {
        state.accessToken = null;
        $("portalView").classList.add("hidden");
        $("loginView").classList.remove("hidden");
        showAuthStatus("Token การเข้าสู่ระบบหมดอายุ (ครบ ~1 ชั่วโมง) กรุณากดปุ่มเข้าสู่ระบบด้วย Gmail อีกครั้งครับ", "warn");
    }

    async function googleApiFetch(url) {
        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${state.accessToken}` }
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            const err = new Error(data?.error?.message || `HTTP ${resp.status}`);
            err.status = resp.status;
            throw err;
        }
        return data;
    }

    // =========================================================================
    // LOAD GOOGLE SHEET DATA
    // =========================================================================
    async function loadSelectedSpreadsheet() {
        const sheetId = state.activeSpreadsheetId;
        if (!sheetId || !state.accessToken) return;

        $("btnRefreshSheet").disabled = true;
        $("btnRefreshSheet").textContent = "กำลังโหลด...";
        $("lnkOpenSheet").href = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`;
        showPortalBanner("กำลังดึงข้อมูลล่าสุดจาก Google Sheets...", "info");

        try {
            const ranges = [
                "Sales!A2:K",
                "Products!A2:O",
                "ProductLots!A2:M",
                "ค่าใช้จ่าย_หักณที่จ่าย!A2:S",
                "ตั้งค่าร้านและภาษี!A2:M2"
            ];

            let valueRanges = [];
            try {
                const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
                const batchResp = await googleApiFetch(url);
                valueRanges = batchResp.valueRanges || [];
            } catch (batchErr) {
                if (batchErr.status === 401) throw batchErr;
                // Fallback สำหรับ Sheet เก่าที่ยังไม่มีบางแท็บ เช่น ProductLots หรือ ตั้งค่าร้านและภาษี
                valueRanges = await Promise.all(
                    ranges.map(async (r) => {
                        try {
                            const singleUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(r)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
                            return await googleApiFetch(singleUrl);
                        } catch {
                            return { values: [] };
                        }
                    })
                );
            }

            const salesRows = valueRanges[0]?.values || [];
            const productRows = valueRanges[1]?.values || [];
            const lotRows = valueRanges[2]?.values || [];
            const expenseRows = valueRanges[3]?.values || [];
            const profileRows = valueRanges[4]?.values || [];

            const storeProfile = parseStoreProfile(profileRows);
            const products = parseProducts(productRows);
            const lots = parseProductLots(lotRows);
            const sales = parseSales(salesRows);
            const expenses = parseExpenses(expenseRows);

            attachLotsAndPacks(products, lots);

            state.rawData = { storeProfile, products, lots, sales, expenses };
            $("hdrStoreName").textContent = storeProfile.storeName || "SaleTD";

            recomputeAndRenderDashboard();
            renderSalesTable();
            renderStockTable();
            hidePortalBanner();
        } catch (err) {
            if (err.status === 401) {
                handleSessionExpired();
                return;
            }
            showPortalBanner(`โหลดข้อมูล Sheet ไม่สำเร็จ: ${err.message}`, "danger");
        } finally {
            $("btnRefreshSheet").disabled = false;
            $("btnRefreshSheet").textContent = "🔄 รีเฟรชข้อมูล";
        }
    }

    // =========================================================================
    // SHEET PARSERS (ตรงตาม Schema ของ SaleTD GoogleCloudService)
    // =========================================================================
    function parseStoreProfile(rows) {
        const row = rows && rows[0] ? rows[0] : [];
        return {
            storeName: cellText(row, 0) || "ร้านค้า SaleTD",
            branch: cellText(row, 1) || "สำนักงานใหญ่"
        };
    }

    function parseProducts(rows) {
        const list = [];
        for (const row of rows) {
            const barcode = cleanCode(cellText(row, 0));
            if (!barcode || barcode.toLowerCase() === "barcode") continue;

            const name = cellText(row, 1) || barcode;
            const costPrice = parseNum(row[2]);
            const price = parseNum(row[3]);
            const stockQty = Math.trunc(parseNum(row[4]));
            const category = cellText(row, 5);
            const expRaw = row[6];
            const expText = cellText(row, 6);
            const expiryDate = expText && expText !== "-" ? parseSheetDate(expRaw, true) : null;
            const baseRaw = cleanCode(cellText(row, 11));
            const baseProductBarcode = baseRaw === "-" ? "" : baseRaw;
            const unitsPerPack = Math.max(1, Math.trunc(parseNum(row[12]) || 1));
            const isLinkedPack = Boolean(baseProductBarcode) && unitsPerPack > 1;
            const createdAt = parseSheetDate(row[13], false) || parseSheetDate(row[9], false) || new Date();
            const lotSummary = cellText(row, 14) || "-";
            const isFoodItem = category.includes("ของกิน") || Boolean(expiryDate);

            list.push({
                barcode,
                name,
                costPrice,
                price,
                stockQty: isLinkedPack ? 0 : stockQty,
                effectiveStockQty: isLinkedPack ? 0 : stockQty,
                baseProductBarcode,
                unitsPerPack,
                isLinkedPack,
                isFoodItem,
                expiryDate,
                effectiveExpiryDate: expiryDate,
                createdAt,
                lotSummary,
                lots: []
            });
        }
        return list;
    }

    function parseProductLots(rows) {
        const list = [];
        for (const row of rows) {
            const lotUid = cleanCode(cellText(row, 0));
            const productBarcode = cleanCode(cellText(row, 1));
            if (!lotUid || !productBarcode || lotUid.toLowerCase() === "lotuid") continue;

            const productName = cellText(row, 2);
            const lotCode = cellText(row, 3) || lotUid;
            const receivedAt = parseSheetDate(row[4], false);
            const expText = cellText(row, 5);
            const expiryDate = expText && expText !== "-" ? parseSheetDate(row[5], true) : null;
            const remainingQty = Math.max(0, Math.trunc(parseNum(row[7])));
            const initialQty = Math.max(remainingQty, Math.trunc(parseNum(row[8])));
            const costPrice = parseNum(row[9]);
            const noteRaw = cellText(row, 11);
            const note = noteRaw === "-" ? "" : noteRaw;

            list.push({
                lotUid,
                productBarcode,
                productName,
                lotCode,
                receivedAt,
                expiryDate,
                remainingQty,
                initialQty,
                costPrice,
                note
            });
        }
        return list;
    }

    function attachLotsAndPacks(products, lots) {
        const byBarcode = new Map(products.map((p) => [p.barcode.toLowerCase(), p]));
        const lotsByBarcode = new Map();

        for (const l of lots) {
            if (l.remainingQty <= 0) continue;
            const key = l.productBarcode.toLowerCase();
            if (!lotsByBarcode.has(key)) lotsByBarcode.set(key, []);
            lotsByBarcode.get(key).push(l);
        }

        const today = startOfDay(new Date());
        for (const p of products) {
            if (p.isLinkedPack) continue;
            const pLots = (lotsByBarcode.get(p.barcode.toLowerCase()) || []).slice().sort((a, b) => {
                const aExp = a.expiryDate ? a.expiryDate.getTime() : Number.MAX_SAFE_INTEGER;
                const bExp = b.expiryDate ? b.expiryDate.getTime() : Number.MAX_SAFE_INTEGER;
                return aExp - bExp;
            });
            p.lots = pLots;
            if (pLots.length > 0) {
                p.stockQty = pLots.reduce((sum, x) => sum + x.remainingQty, 0);
                p.effectiveStockQty = p.stockQty;
                const earliest = pLots.find((x) => x.expiryDate)?.expiryDate || null;
                p.expiryDate = earliest;
                p.effectiveExpiryDate = earliest;
            }
            p.daysUntilExpiry = p.effectiveExpiryDate
                ? Math.round((startOfDay(p.effectiveExpiryDate) - today) / 86400000)
                : null;
        }

        for (const p of products) {
            if (!p.isLinkedPack) continue;
            const base = byBarcode.get(p.baseProductBarcode.toLowerCase());
            if (base) {
                p.baseProductName = base.name;
                p.effectiveStockQty = Math.max(0, Math.floor(base.stockQty / Math.max(1, p.unitsPerPack)));
                p.effectiveCostPrice = base.costPrice * p.unitsPerPack;
                p.effectiveExpiryDate = base.effectiveExpiryDate;
                p.daysUntilExpiry = base.daysUntilExpiry;
                p.lots = base.lots;
            } else {
                p.baseProductName = "(ไม่พบสินค้าหลัก)";
                p.effectiveStockQty = 0;
                p.effectiveCostPrice = p.costPrice;
                p.daysUntilExpiry = null;
            }
        }
    }

    function parseSales(rows) {
        const list = [];
        for (const row of rows) {
            const invoiceNo = cellText(row, 0);
            if (!invoiceNo || invoiceNo === "เลขที่บิล") continue;

            const saleDate = parseSheetDate(row[1], false);
            if (!saleDate) continue;

            const memberPhone = cleanCode(cellText(row, 2));
            const memberName = cellText(row, 3) || "ลูกค้าทั่วไป";
            const itemsSummary = cellText(row, 4);
            const totalAmount = parseNum(row[5]);
            const discountGiftText = cellText(row, 6) || "-";
            const promoText = cellText(row, 7) || "-";
            const grossAmount = parseNum(row[8]) || totalAmount;
            const status = cellText(row, 9) || "ปกติ";
            const detailJson = cellText(row, 10);

            let items = [];
            if (detailJson && detailJson !== "[]") {
                try {
                    const parsed = JSON.parse(detailJson);
                    if (Array.isArray(parsed)) {
                        items = parsed.map((x) => ({
                            barcode: cleanCode(x.Barcode || x.barcode || ""),
                            productName: x.ProductName || x.productName || "",
                            qty: Math.max(0, Math.trunc(Number(x.Qty ?? x.qty ?? 0))),
                            unitPrice: Number(x.UnitPrice ?? x.unitPrice ?? 0),
                            discountPerUnit: Number(x.DiscountPerUnit ?? x.discountPerUnit ?? 0),
                            isFreeGift: Boolean(x.IsFreeGift ?? x.isFreeGift),
                            subTotal: Number(x.SubTotal ?? x.subTotal ?? 0)
                        }));
                    }
                } catch {
                    // Fallback to summary text below
                }
            }

            list.push({
                invoiceNo,
                saleDate,
                memberPhone: memberPhone === "-" ? "" : memberPhone,
                memberName,
                itemsSummary,
                totalAmount,
                discountGiftText,
                promoText,
                grossAmount,
                status,
                isVoided: status === "ยกเลิกบิล",
                items
            });
        }
        return list.sort((a, b) => b.saleDate - a.saleDate);
    }

    function parseExpenses(rows) {
        const list = [];
        for (const row of rows) {
            const eventId = cellText(row, 0);
            if (!eventId || eventId === "EventId") continue;
            const expenseDate = parseSheetDate(row[2], false) || new Date();
            const category = cellText(row, 7);
            const baseAmount = parseNum(row[9]);
            const status = cellText(row, 16) || "ปกติ";
            if (status === "ยกเลิก") continue;
            list.push({ eventId, expenseDate, category, baseAmount, status });
        }
        return list;
    }

    // =========================================================================
    // FORECASTING ENGINE (พอร์ตจาก DashboardForecastService.cs)
    // =========================================================================
    function recomputeAndRenderDashboard() {
        if (!state.rawData) return;
        const historyDays = Number($("selHistoryDays").value || 60);
        const forecastDays = Number($("selForecastDays").value || 30);

        const forecast = computeForecast(state.rawData, historyDays, forecastDays);
        state.forecast = forecast;
        renderDashboard(forecast);
    }

    function computeForecast(data, historyDays, forecastHorizonDays) {
        const today = startOfDay(new Date());
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const historyStart = addDays(today, -(historyDays - 1));
        const tomorrow = addDays(today, 1);

        const baseProducts = data.products.filter((p) => !p.isLinkedPack);
        const byBarcode = new Map(data.products.map((p) => [p.barcode.toLowerCase(), p]));
        const byName = new Map(data.products.map((p) => [p.name.trim().toLowerCase(), p]));
        const packsByBase = new Map();
        for (const p of data.products) {
            if (!p.isLinkedPack) continue;
            const k = p.baseProductBarcode.toLowerCase();
            if (!packsByBase.has(k)) packsByBase.set(k, []);
            packsByBase.get(k).push(p);
        }

        const validSales = data.sales.filter((s) => !s.isVoided);
        const todaySalesRows = validSales.filter((s) => startOfDay(s.saleDate).getTime() === today.getTime());
        const monthSalesRows = validSales.filter((s) => s.saleDate >= monthStart && s.saleDate < tomorrow);
        const historySalesRows = validSales.filter((s) => s.saleDate >= historyStart && s.saleDate < tomorrow);

        const todaySales = todaySalesRows.reduce((a, b) => a + b.totalAmount, 0);
        const monthSales = monthSalesRows.reduce((a, b) => a + b.totalAmount, 0);
        const historyRevenue = historySalesRows.reduce((a, b) => a + b.totalAmount, 0);
        const historyBills = historySalesRows.length;

        let firstEverDate = today;
        if (validSales.length > 0) {
            firstEverDate = startOfDay(validSales[validSales.length - 1].saleDate);
        }
        const effectiveStoreStart = firstEverDate > historyStart ? firstEverDate : historyStart;
        const hasPriorDays = effectiveStoreStart < today && historySalesRows.some((s) => startOfDay(s.saleDate) < today);
        const completedEnd = hasPriorDays ? addDays(today, -1) : today;
        const actualDataSpanDays = historySalesRows.length > 0
            ? Math.max(1, Math.round((today - effectiveStoreStart) / 86400000) + 1)
            : 0;

        const dailyActual = new Map();
        const prodAcc = new Map();
        const prodDaily = new Map();
        for (const p of baseProducts) {
            prodAcc.set(p.barcode.toLowerCase(), { totalPieces: 0, totalRev: 0, singleQty: 0, packQty: 0, earliestSale: null, saleDays: new Set() });
            prodDaily.set(p.barcode.toLowerCase(), new Map());
        }

        let totalKnownCogs = 0;
        let totalRevWithCost = 0;
        const missingCostBarcodes = new Set();

        for (const tx of historySalesRows) {
            const dKey = dateKey(tx.saleDate);
            const dStart = startOfDay(tx.saleDate);

            // Resolve items from ItemsDetailJson or fallback to ItemsSummary regex
            let lineItems = tx.items;
            if (!lineItems || lineItems.length === 0) {
                lineItems = parseFallbackSummaryItems(tx.itemsSummary, byName, tx.totalAmount);
            }

            const txSubSum = lineItems.reduce((sum, i) => sum + (i.subTotal || 0), 0);
            const billScale = txSubSum > 0 && tx.totalAmount >= 0 && tx.totalAmount < txSubSum
                ? tx.totalAmount / txSubSum
                : 1;

            let txCogs = 0;
            let txRevCost = 0;
            let txUnits = 0;

            for (const item of lineItems) {
                const soldProd = (item.barcode && byBarcode.get(item.barcode.toLowerCase())) ||
                                 (item.productName && byName.get(item.productName.trim().toLowerCase()));
                if (!soldProd) continue;

                const target = (soldProd.isLinkedPack && byBarcode.get(soldProd.baseProductBarcode.toLowerCase())) || soldProd;
                const mult = soldProd.isLinkedPack && target !== soldProd ? Math.max(1, soldProd.unitsPerPack) : 1;
                const basePieces = Math.max(0, item.qty * mult);
                if (basePieces <= 0) continue;

                txUnits += basePieces;
                const lineNetRev = (item.subTotal || 0) * billScale;
                const hasCost = target.costPrice > 0;
                const lineCost = hasCost ? target.costPrice * basePieces : 0;

                if (hasCost) {
                    txCogs += lineCost;
                    txRevCost += lineNetRev;
                } else {
                    missingCostBarcodes.add(target.barcode);
                }

                const key = target.barcode.toLowerCase();
                if (!prodAcc.has(key)) {
                    prodAcc.set(key, { totalPieces: 0, totalRev: 0, singleQty: 0, packQty: 0, earliestSale: null, saleDays: new Set() });
                    prodDaily.set(key, new Map());
                }
                const acc = prodAcc.get(key);
                acc.totalPieces += basePieces;
                acc.totalRev += lineNetRev;
                if (soldProd.isLinkedPack) acc.packQty += item.qty;
                else acc.singleQty += item.qty;
                if (!acc.earliestSale || dStart < acc.earliestSale) acc.earliestSale = dStart;
                acc.saleDays.add(dKey);

                const dm = prodDaily.get(key);
                dm.set(dKey, (dm.get(dKey) || 0) + basePieces);
            }

            totalKnownCogs += txCogs;
            totalRevWithCost += txRevCost;

            const prev = dailyActual.get(dKey) || { rev: 0, bills: 0, units: 0 };
            dailyActual.set(dKey, {
                rev: prev.rev + tx.totalAmount,
                bills: prev.bills + 1,
                units: prev.units + txUnits
            });
        }

        const anyCostSold = totalRevWithCost > 0;
        const knownMarginRatio = anyCostSold
            ? clamp((totalRevWithCost - totalKnownCogs) / totalRevWithCost, 0, 0.95)
            : 0.25;
        const historyGrossProfit = anyCostSold
            ? (totalRevWithCost - totalKnownCogs) + ((historyRevenue - totalRevWithCost) * knownMarginRatio)
            : 0;
        const historyGrossMarginPct = historyRevenue > 0 && anyCostSold
            ? Math.round((historyGrossProfit / historyRevenue) * 1000) / 10
            : 0;

        const historyOpExpenses = data.expenses
            .filter((e) => e.expenseDate >= historyStart && e.category !== "ซื้อสินค้ามาขาย (ต้นทุน)")
            .reduce((sum, e) => sum + e.baseAmount, 0);

        const completedDays = [];
        for (let dt = new Date(effectiveStoreStart); dt <= completedEnd; dt = addDays(dt, 1)) {
            const stat = dailyActual.get(dateKey(dt)) || { rev: 0, bills: 0, units: 0 };
            completedDays.push({ date: dt, rev: stat.rev, bills: stat.bills });
        }

        const completedMeanRev = completedDays.length > 0
            ? completedDays.reduce((s, d) => s + d.rev, 0) / completedDays.length
            : 0;

        let revenueTrendPct = 0;
        const halfWin = Math.max(3, Math.min(14, Math.floor(completedDays.length / 2)));
        if (completedDays.length >= 6) {
            const priorSlice = completedDays.slice(Math.max(0, completedDays.length - halfWin * 2), completedDays.length - halfWin);
            const recentSlice = completedDays.slice(completedDays.length - halfWin);
            const priorMean = priorSlice.reduce((s, x) => s + x.rev, 0) / Math.max(1, priorSlice.length);
            const recentMean = recentSlice.reduce((s, x) => s + x.rev, 0) / Math.max(1, recentSlice.length);
            if (priorMean > 0) revenueTrendPct = Math.round(((recentMean - priorMean) / priorMean) * 1000) / 10;
            else if (recentMean > 0) revenueTrendPct = 100;
        }

        const { factors: dowFactors, rows: weekdayStats, peakDay, weakDay } = buildWeekdaySeasonality(completedDays, completedMeanRev);
        const revArr = completedDays.map((x) => x.rev);
        const weightedBaseline = computeRecencyWeightedMean(revArr);
        const dampedSlope = computeDampedSlope(revArr);
        const avgBillsPerDay = completedDays.length > 0
            ? completedDays.reduce((s, x) => s + x.bills, 0) / completedDays.length
            : 0;
        const avgDailyRevenue = actualDataSpanDays > 0 ? historyRevenue / actualDataSpanDays : 0;
        const avgBasketValue = historyBills > 0 ? historyRevenue / historyBills : 0;
        const effTicket = avgBillsPerDay > 0 && weightedBaseline > 0
            ? Math.max(1, weightedBaseline / avgBillsPerDay)
            : Math.max(1, avgBasketValue);

        // Chart Series
        const chartHistWin = Math.min(30, Math.max(14, forecastHorizonDays));
        let chartStart = addDays(today, -(chartHistWin - 1));
        if (actualDataSpanDays > 0 && effectiveStoreStart > chartStart) {
            chartStart = effectiveStoreStart;
        }

        const dailySeries = [];
        for (let dt = new Date(chartStart); dt <= today; dt = addDays(dt, 1)) {
            const stat = dailyActual.get(dateKey(dt)) || { rev: 0, bills: 0, units: 0 };
            dailySeries.push({
                date: dt,
                shortLabel: formatShortDate(dt),
                thaiDay: getShortThaiDay(dt.getDay()),
                revenue: Math.round(stat.rev),
                bills: stat.bills,
                units: stat.units,
                isForecast: false,
                isToday: dt.getTime() === today.getTime(),
                low: stat.rev,
                high: stat.rev
            });
        }

        const relUnc = computeRelativeUncertainty(revArr);
        let projectedRevenue = 0;
        let projectedLow = 0;
        let projectedHigh = 0;
        let projectedBills = 0;
        let horizonDowSum = 0;

        for (let step = 1; step <= forecastHorizonDays; step++) {
            const futureDt = addDays(today, step);
            const dowMult = dowFactors.get(futureDt.getDay()) || 1;
            horizonDowSum += dowMult;
            const pred = Math.max(0, Math.round((weightedBaseline + dampedSlope * step) * dowMult));
            const band = Math.min(0.45, relUnc + 0.004 * step);
            const low = Math.max(0, Math.round(pred * (1 - band)));
            const high = Math.round(pred * (1 + band));
            const estBills = pred > 0 && effTicket > 0 ? Math.max(1, Math.round(pred / effTicket)) : 0;

            projectedRevenue += pred;
            projectedLow += low;
            projectedHigh += high;
            projectedBills += estBills;

            dailySeries.push({
                date: futureDt,
                shortLabel: formatShortDate(futureDt),
                thaiDay: getShortThaiDay(futureDt.getDay()),
                revenue: pred,
                bills: estBills,
                units: 0,
                isForecast: true,
                isToday: false,
                low,
                high
            });
        }

        const horizonDowAvg = forecastHorizonDays > 0 ? horizonDowSum / forecastHorizonDays : 1;
        const tomorrowPt = dailySeries.find((x) => x.isForecast);
        const tomorrowNote = buildTomorrowNote(tomorrow, tomorrowPt, weekdayStats, weightedBaseline);

        // Inventory summary
        let totalStockUnits = 0;
        let totalInventoryCost = 0;
        let totalInventoryRetail = 0;
        let outOfStockCount = 0;
        let lowStockCount = 0;
        let nearExpiryCount = 0;
        let expiredCount = 0;

        for (const p of baseProducts) {
            const st = Math.max(0, p.stockQty);
            totalStockUnits += st;
            totalInventoryCost += st * p.costPrice;
            totalInventoryRetail += st * p.price;
            if (st <= 0) outOfStockCount++;
            else if (st < 5) lowStockCount++;

            const hasExpLot = p.lots.some((l) => l.expiryDate && daysUntil(l.expiryDate, today) <= 0) ||
                              (p.lots.length === 0 && st > 0 && p.daysUntilExpiry !== null && p.daysUntilExpiry <= 0);
            const hasNearLot = p.lots.some((l) => l.expiryDate && daysUntil(l.expiryDate, today) > 0 && daysUntil(l.expiryDate, today) <= 30) ||
                               (p.lots.length === 0 && st > 0 && p.daysUntilExpiry !== null && p.daysUntilExpiry > 0 && p.daysUntilExpiry <= 30);
            if (hasExpLot) expiredCount++;
            else if (hasNearLot) nearExpiryCount++;
        }

        // Per-SKU Forecasting
        const bestSellers = [];
        const increaseList = [];
        const reduceList = [];
        const safetyDays = Math.max(3, Math.min(7, Math.floor(forecastHorizonDays / 5)));

        for (const p of baseProducts) {
            const key = p.barcode.toLowerCase();
            const acc = prodAcc.get(key) || { totalPieces: 0, totalRev: 0, singleQty: 0, packQty: 0, earliestSale: null, saleDays: new Set() };
            const pDm = prodDaily.get(key) || new Map();
            const linkedPacks = packsByBase.get(key) || [];

            const createdDt = startOfDay(p.createdAt || effectiveStoreStart);
            let prodStart = acc.earliestSale && acc.earliestSale < createdDt ? acc.earliestSale : createdDt;
            if (prodStart < effectiveStoreStart) prodStart = effectiveStoreStart;
            if (prodStart > today) prodStart = today;

            const productAgeDays = Math.max(1, Math.round((today - createdDt) / 86400000) + 1);
            const completedDaysProd = hasPriorDays && prodStart <= completedEnd
                ? Math.max(1, Math.round((completedEnd - prodStart) / 86400000) + 1)
                : 1;

            const todayQty = pDm.get(dateKey(today)) || 0;
            const completedQty = acc.totalPieces - todayQty;
            const velCompleted = completedQty / completedDaysProd;
            const velInclusive = acc.totalPieces / (hasPriorDays && prodStart <= completedEnd ? completedDaysProd + 1 : 1);
            const baseVel = Math.max(velCompleted, velInclusive);

            const prodHalf = Math.max(3, Math.min(14, Math.floor(completedDaysProd / 2)));
            const hasTrendWin = hasPriorDays && completedDaysProd >= 6;
            let recentQty = 0;
            let priorQty = 0;
            let recentRate = baseVel;
            let priorRate = baseVel;

            if (hasTrendWin) {
                for (let i = 0; i < prodHalf; i++) {
                    recentQty += pDm.get(dateKey(addDays(completedEnd, -i))) || 0;
                    priorQty += pDm.get(dateKey(addDays(completedEnd, -prodHalf - i))) || 0;
                }
                recentRate = recentQty / prodHalf;
                priorRate = priorQty / prodHalf;
            }

            let smoothedTrend = 0;
            let isNewlyTrending = false;
            if (hasTrendWin) {
                if (priorQty === 0 && recentQty >= 2) {
                    isNewlyTrending = true;
                    smoothedTrend = 65;
                } else {
                    const k = 0.2;
                    smoothedTrend = Math.round((((recentRate + k) / (priorRate + k)) - 1) * 1000) / 10;
                }
            }

            const blendedVel = hasTrendWin ? (0.65 * recentRate + 0.35 * baseVel) : baseVel;
            const trendTilt = clamp(1 + (smoothedTrend / 100) * 0.35, 0.65, 1.45);
            let forecastVel = Math.round(blendedVel * trendTilt * horizonDowAvg * 100) / 100;
            if (!hasPriorDays && acc.totalPieces > 0) {
                forecastVel = Math.round(baseVel * 100) / 100;
            }

            const realizedPrice = acc.totalPieces > 0 && acc.totalRev > 0 ? acc.totalRev / acc.totalPieces : p.price;
            const hasCost = p.costPrice > 0;
            const unitMargin = hasCost ? realizedPrice - p.costPrice : 0;
            const marginPct = hasCost && realizedPrice > 0 ? Math.round((unitMargin / realizedPrice) * 1000) / 10 : 0;

            const predictedQty = forecastVel > 0 ? Math.ceil(forecastVel * forecastHorizonDays) : 0;
            const predictedRev = Math.round(predictedQty * realizedPrice);
            const predictedProfit = hasCost ? Math.round(predictedQty * unitMargin) : 0;
            const currentStock = Math.max(0, p.stockQty);
            const daysLeft = forecastVel > 0.01 ? Math.floor(currentStock / forecastVel) : (currentStock > 0 ? 999 : 0);

            const { expiredQty, nearRiskQty, nearestExpDays } = evaluateLotExpiryRisk(p, forecastVel, today);

            if (predictedQty > 0 || acc.totalPieces > 0) {
                const { badge: trendBadge, tone: trendTone } = classifyTrendBadge(smoothedTrend, isNewlyTrending, hasTrendWin, acc.saleDays.size);
                const { text: stockText, tone: stockTone } = classifyStockReadiness(currentStock, predictedQty, daysLeft, forecastHorizonDays);
                const consistency = Math.min(1.3, 0.8 + acc.saleDays.size * 0.03);
                const momBonus = isNewlyTrending ? 1.25 : clamp(1 + smoothedTrend / 200, 0.75, 1.35);
                const score = (predictedQty * Math.max(1, realizedPrice * 0.25) + predictedRev * 0.5) * consistency * momBonus;

                bestSellers.push({
                    barcode: p.barcode,
                    name: p.name,
                    packNote: acc.packQty > 0 ? `รวมแพ็ค (เดี่ยว ${acc.singleQty} + แพ็ค ${acc.packQty})` : (p.isFoodItem ? "ของกิน" : "ทั่วไป"),
                    currentStock,
                    hasCost,
                    marginPct,
                    soldHistoryQty: acc.totalPieces,
                    dailyVel: forecastVel,
                    trendPct: smoothedTrend,
                    trendBadge,
                    trendTone,
                    predictedQty,
                    predictedRev,
                    predictedProfit,
                    daysLeft,
                    stockText,
                    stockTone,
                    score
                });
            }

            const hasSpoilageRisk = expiredQty > 0 || nearRiskQty > 0;
            const isZeroOrNegMargin = hasCost && realizedPrice <= p.costPrice;

            if (hasSpoilageRisk) {
                const riskQty = expiredQty + nearRiskQty;
                const riskCap = Math.round(riskQty * (hasCost ? p.costPrice : realizedPrice));
                reduceList.push({
                    barcode: p.barcode,
                    name: p.name,
                    currentStock,
                    daysLeft,
                    deltaQty: riskQty,
                    financialImpact: riskCap,
                    priorityBadge: expiredQty > 0 ? "🚨 หมดอายุแล้ว" : "⏰ เสี่ยงหมดอายุค้าง",
                    priorityTone: "danger",
                    sortOrder: expiredQty > 0 ? 1 : 2,
                    actionText: expiredQty > 0
                        ? `นำออกทันที ${riskQty} ชิ้น & งดสั่งเพิ่ม`
                        : `งดสั่งเพิ่ม & ลดราคาระบาย ${nearRiskQty} ชิ้น`,
                    reason: expiredQty > 0
                        ? `มีสินค้าหมดอายุค้างสต๊อก ${expiredQty} ชิ้น`
                        : `อีก ${nearestExpDays} วันหมดอายุ ความเร็ว ${forecastVel.toFixed(1)}/วัน จะเหลือค้าง ~${nearRiskQty} ชิ้น`
                });
                continue;
            }

            const neededBuf = forecastVel > 0 ? Math.ceil(forecastVel * (forecastHorizonDays + safetyDays)) : 0;
            const deficit = neededBuf - currentStock;
            const isRising = smoothedTrend >= 20 && acc.totalPieces >= 3 && daysLeft < forecastHorizonDays + 7 && !isZeroOrNegMargin;
            const isEmptyHist = currentStock <= 0 && acc.totalPieces > 0;
            const isLowHist = currentStock < 5 && acc.totalPieces > 0 && !isZeroOrNegMargin;

            if (!isZeroOrNegMargin && (isEmptyHist || deficit > 0 || isRising || isLowHist)) {
                let orderQty = Math.max(deficit, 0);
                if (orderQty < 5 && (isEmptyHist || isLowHist)) {
                    orderQty = Math.max(5, Math.ceil(Math.max(0.5, forecastVel) * 14) - currentStock);
                }
                if (isRising && orderQty <= 0) {
                    orderQty = Math.max(6, Math.ceil(forecastVel * 10));
                }
                if (orderQty > 0) {
                    const packHint = linkedPacks.length > 0
                        ? `หรือสั่ง ${Math.ceil(orderQty / Math.max(1, linkedPacks[0].unitsPerPack))} แพ็ค (${linkedPacks[0].name})`
                        : "";
                    let badge = "📈 ควรเติมให้พอขาย";
                    let tone = "info";
                    let sortOrder = 4;
                    let reason = `คาดการณ์ใช้ ${predictedQty} ชิ้น (+เผื่อ ${safetyDays} วัน) ปัจจุบันเหลือ ${currentStock} ชิ้น`;

                    if (currentStock <= 0) {
                        badge = "🔴 หมดสต็อก (ขายดี)";
                        tone = "danger";
                        sortOrder = 1;
                        reason = `สต็อกเป็น 0 ทั้งที่คาดการณ์ขายได้ ~${predictedQty} ชิ้น (${forecastVel.toFixed(1)}/วัน)`;
                    } else if (daysLeft <= 5) {
                        badge = "🟠 ใกล้หมดสต็อกด่วน";
                        tone = "danger";
                        sortOrder = 2;
                        reason = `เหลือ ${currentStock} ชิ้น พอขายอีกแค่ ~${daysLeft} วัน ขณะที่คาดการณ์ต้องใช้ ${predictedQty} ชิ้น`;
                    } else if (smoothedTrend >= 20 || isNewlyTrending) {
                        badge = "🚀 โตแรง-ควรสต็อกเพิ่ม";
                        tone = "ok";
                        sortOrder = 3;
                        reason = `ความต้องการโต +${Math.round(smoothedTrend)}% (${forecastVel.toFixed(1)}/วัน) สต็อกไม่พอรองรับ ${forecastHorizonDays} วันหน้า`;
                    }

                    increaseList.push({
                        barcode: p.barcode,
                        name: p.name,
                        packHint,
                        currentStock,
                        daysLeft,
                        predictedDemand: predictedQty,
                        deltaQty: orderQty,
                        hasCost,
                        financialImpact: hasCost ? Math.round(orderQty * p.costPrice) : 0,
                        priorityBadge: badge,
                        priorityTone: tone,
                        sortOrder,
                        reason
                    });
                    continue;
                }
            }

            if (currentStock > 0) {
                const tiedUp = Math.round(currentStock * (hasCost ? p.costPrice : realizedPrice));
                const excessThresh = Math.max(45, forecastHorizonDays * 2);

                if (isZeroOrNegMargin) {
                    reduceList.push({
                        barcode: p.barcode,
                        name: p.name,
                        currentStock,
                        daysLeft,
                        deltaQty: currentStock,
                        financialImpact: tiedUp,
                        priorityBadge: "💸 กำไรต่ำ/ขาดทุน",
                        priorityTone: "danger",
                        sortOrder: 3,
                        actionText: `หยุดสั่งเพิ่ม & ปรับราคา (ทุน ฿${p.costPrice.toFixed(2)} / ขาย ฿${realizedPrice.toFixed(2)})`,
                        reason: `ราคาขายสุทธิต่ำกว่าหรือเท่ากับทุน (${marginPct.toFixed(1)}%)`
                    });
                } else if (acc.totalPieces === 0 && actualDataSpanDays >= 7 && (productAgeDays >= 14 || (productAgeDays >= 7 && historySalesRows.length >= 10))) {
                    const targetReduce = Math.max(1, currentStock - 3);
                    reduceList.push({
                        barcode: p.barcode,
                        name: p.name,
                        currentStock,
                        daysLeft: 999,
                        deltaQty: targetReduce,
                        financialImpact: tiedUp,
                        priorityBadge: "🧊 ขายไม่ออก (Dead Stock)",
                        priorityTone: tiedUp >= 500 ? "warn" : "neutral",
                        sortOrder: 4,
                        actionText: `งดสั่งเพิ่ม & จัดโปรระบาย ~${targetReduce} ชิ้น`,
                        reason: `ไม่มียอดขายเลยในช่วง ${actualDataSpanDays} วัน มีทุนค้างในสต๊อก ฿${fmtInt(tiedUp)}`
                    });
                } else if (hasTrendWin && smoothedTrend <= -25 && priorQty >= 3 && daysLeft > Math.max(10, forecastHorizonDays)) {
                    const cutPct = Math.min(70, Math.max(25, Math.round(Math.abs(smoothedTrend))));
                    const excess = Math.max(0, currentStock - Math.max(3, predictedQty + 3));
                    const excessCap = Math.round(excess * (hasCost ? p.costPrice : realizedPrice));
                    reduceList.push({
                        barcode: p.barcode,
                        name: p.name,
                        currentStock,
                        daysLeft,
                        deltaQty: excess,
                        financialImpact: excess > 0 ? excessCap : tiedUp,
                        priorityBadge: "📉 ยอดขายขาลงชัดเจน",
                        priorityTone: "warn",
                        sortOrder: 5,
                        actionText: `ลดยอดสั่งรอบหน้าลง ${cutPct}%${excess > 0 ? ` (ส่วนเกิน ~${excess} ชิ้น)` : ""}`,
                        reason: `ยอดขายลดลง ${Math.round(Math.abs(smoothedTrend))}% (${priorQty} → ${recentQty} ชิ้น) สต๊อกขายได้อีก ~${daysLeft} วัน`
                    });
                } else if (forecastVel > 0.01 && daysLeft > excessThresh && currentStock >= 8) {
                    const idealMax = Math.max(6, Math.ceil(forecastVel * (forecastHorizonDays + 14)));
                    const excess = Math.max(1, currentStock - idealMax);
                    const excessCap = Math.round(excess * (hasCost ? p.costPrice : realizedPrice));
                    reduceList.push({
                        barcode: p.barcode,
                        name: p.name,
                        currentStock,
                        daysLeft,
                        deltaQty: excess,
                        financialImpact: excessCap,
                        priorityBadge: "📦 สต็อกล้น / ทุนจม",
                        priorityTone: "neutral",
                        sortOrder: 6,
                        actionText: `ชะลอสั่งซื้อ & ลดสต็อกส่วนเกิน ~${excess} ชิ้น`,
                        reason: `สต็อก ${currentStock} ชิ้น พอขายนาน ~${daysLeft} วัน เงินจม ฿${fmtInt(excessCap)}`
                    });
                }
            }
        }

        bestSellers.sort((a, b) => b.score - a.score || b.predictedRev - a.predictedRev);
        const rankedBest = bestSellers.slice(0, 25).map((item, idx) => ({ ...item, rank: idx + 1 }));

        increaseList.sort((a, b) => a.sortOrder - b.sortOrder || b.predictedDemand - a.predictedDemand);
        reduceList.sort((a, b) => a.sortOrder - b.sortOrder || b.financialImpact - a.financialImpact);

        const reorderBudget = increaseList.reduce((s, x) => s + x.financialImpact, 0);
        const reducibleCapital = reduceList.reduce((s, x) => s + x.financialImpact, 0);
        const projectedAvgDaily = forecastHorizonDays > 0 ? projectedRevenue / forecastHorizonDays : 0;
        const projectedGrossProfit = anyCostSold ? Math.round(projectedRevenue * knownMarginRatio) : 0;

        const bullets = buildExecutiveBullets({
            historyDays,
            forecastHorizonDays,
            actualDataSpanDays,
            hasSales: historySalesRows.length > 0,
            projectedRevenue,
            projectedGrossProfit,
            revenueTrendPct,
            peakDay,
            weakDay,
            tomorrowNote,
            bestSellers: rankedBest,
            increaseList,
            reduceList,
            reorderBudget,
            reducibleCapital
        });

        return {
            generatedAt: new Date(),
            historyDays,
            forecastHorizonDays,
            actualDataSpanDays,
            hasEnoughSales: historySalesRows.length > 0 && actualDataSpanDays >= 3,
            todaySales,
            todayBills: todaySalesRows.length,
            monthSales,
            historyRevenue,
            historyBills,
            avgDailyRevenue,
            avgBasketValue,
            historyGrossProfit,
            historyGrossMarginPct,
            missingCostCount: missingCostBarcodes.size,
            historyOpExpenses,
            revenueTrendPct,
            totalBaseSkus: baseProducts.length,
            totalStockUnits,
            totalInventoryCost,
            totalInventoryRetail,
            outOfStockCount,
            lowStockCount,
            nearExpiryCount,
            expiredCount,
            projectedRevenue,
            projectedLow,
            projectedHigh,
            projectedAvgDaily,
            projectedGrossProfit,
            projectedBills,
            reorderBudget,
            reducibleCapital,
            weekdayStats,
            tomorrowNote,
            dailySeries,
            bestSellers: rankedBest,
            increaseList,
            reduceList,
            bullets
        };
    }

    function evaluateLotExpiryRisk(product, dailyVel, today) {
        const lots = product.lots && product.lots.length > 0
            ? product.lots.map((l) => ({ qty: l.remainingQty, exp: l.expiryDate }))
            : (product.stockQty > 0 && product.expiryDate ? [{ qty: product.stockQty, exp: product.expiryDate }] : []);

        if (lots.length === 0) return { expiredQty: 0, nearRiskQty: 0, nearestExpDays: null };

        let nearestExpDays = null;
        let expiredQty = 0;
        let nearRiskQty = 0;
        let consumedDays = 0;

        for (const lot of lots) {
            if (lot.exp) {
                const dLeft = Math.round((startOfDay(lot.exp) - today) / 86400000);
                if (nearestExpDays === null || dLeft < nearestExpDays) nearestExpDays = dLeft;
                if (dLeft <= 0) {
                    expiredQty += lot.qty;
                    continue;
                }
                if (dLeft <= 30) {
                    if (dailyVel <= 0.01) {
                        nearRiskQty += lot.qty;
                    } else {
                        const remWin = Math.max(0, dLeft - consumedDays);
                        const sellable = Math.floor(remWin * dailyVel);
                        nearRiskQty += Math.max(0, lot.qty - sellable);
                    }
                }
            }
            if (dailyVel > 0.01) consumedDays += lot.qty / dailyVel;
        }
        return { expiredQty, nearRiskQty, nearestExpDays };
    }

    function buildWeekdaySeasonality(completedDays, overallMean) {
        const order = [1, 2, 3, 4, 5, 6, 0];
        const names = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
        const factors = new Map();
        const rows = [];

        for (const dow of order) {
            const matching = completedDays.filter((d) => d.date.getDay() === dow);
            const rawMean = matching.length > 0
                ? matching.reduce((s, x) => s + x.rev, 0) / matching.length
                : overallMean;
            const rawRatio = overallMean > 0 ? rawMean / overallMean : 1;
            const weight = matching.length / (matching.length + 2);
            const factor = clamp(1 + (rawRatio - 1) * weight, 0.65, 1.45);
            factors.set(dow, factor);
            rows.push({
                dow,
                name: names[dow],
                avgRev: Math.round(rawMean),
                factor,
                isPeak: false,
                isWeak: false
            });
        }

        if (overallMean > 0 && completedDays.length >= 4) {
            const sorted = rows.slice().sort((a, b) => b.avgRev - a.avgRev);
            if (sorted[0].dow !== sorted[sorted.length - 1].dow) {
                sorted[0].isPeak = true;
                sorted[sorted.length - 1].isWeak = true;
            }
        }

        return {
            factors,
            rows,
            peakDay: rows.find((r) => r.isPeak) || null,
            weakDay: rows.find((r) => r.isWeak) || null
        };
    }

    function buildTomorrowNote(tomorrow, tomorrowPt, weekdayStats, baseline) {
        if (!tomorrowPt || baseline <= 0) {
            return "ยังไม่มีประวัติการขายเพียงพอสำหรับทำนายวันพรุ่งนี้";
        }
        const names = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
        const stat = weekdayStats.find((w) => w.dow === tomorrow.getDay());
        const diffPct = stat ? Math.round((stat.factor - 1) * 100) : 0;
        const rel = diffPct >= 5
            ? `สูงกว่าค่าเฉลี่ย +${diffPct}% (ควรเตรียมสต๊อกสินค้าขายดีให้พร้อม)`
            : (diffPct <= -5 ? `ต่ำกว่าค่าเฉลี่ย ${diffPct}%` : "ใกล้เคียงค่าเฉลี่ยปกติ");
        return `พรุ่งนี้ (${names[tomorrow.getDay()]}) คาดการณ์ยอดขาย ~฿${fmtInt(tomorrowPt.revenue)} — ${rel}`;
    }

    function buildExecutiveBullets(ctx) {
        if (!ctx.hasSales) {
            return [
                "ยังไม่พบประวัติการขายในช่วงเวลานี้ — ระบบวิเคราะห์สต๊อกคงเหลือ สินค้าทุนจม และวันหมดอายุให้ด้านล่างแล้ว",
                `พบสินค้าที่ควรลด/ระบาย ${ctx.reduceList.length} รายการ (มูลค่า ฿${fmtInt(ctx.reducibleCapital)}) และควรเติม ${ctx.increaseList.length} รายการ`
            ];
        }
        const trendWord = ctx.revenueTrendPct >= 5 ? `โตขึ้น +${ctx.revenueTrendPct}%` : (ctx.revenueTrendPct <= -5 ? `ชะลอตัว ${ctx.revenueTrendPct}%` : "ทรงตัวสม่ำเสมอ");
        const list = [
            `🔮 คาดการณ์ ${ctx.forecastHorizonDays} วันข้างหน้า: ยอดขาย ~฿${fmtInt(ctx.projectedRevenue)} (กำไรขั้นต้น ~฿${fmtInt(ctx.projectedGrossProfit)}) แนวโน้มร้าน${trendWord}`
        ];
        if (ctx.bestSellers.length > 0) {
            list.push(`🔥 คาดว่าจะขายดีที่สุด: ${ctx.bestSellers.slice(0, 3).map((b) => `${b.name} (~${b.predictedQty} ชิ้น)`).join(", ")}`);
        }
        if (ctx.increaseList.length > 0) {
            list.push(`📈 ควรเพิ่มสต๊อก (${ctx.increaseList.length} รายการ | งบ ~฿${fmtInt(ctx.reorderBudget)}): ${ctx.increaseList.slice(0, 3).map((i) => `${i.name} (+${i.deltaQty})`).join(", ")}`);
        } else {
            list.push("📈 สต๊อกสินค้าขายดียังเพียงพอต่อความต้องการในช่วงคาดการณ์");
        }
        if (ctx.reduceList.length > 0) {
            list.push(`📉 ควรลด/ระบาย (${ctx.reduceList.length} รายการ | ทุนจม/เสี่ยง ฿${fmtInt(ctx.reducibleCapital)}): ${ctx.reduceList.slice(0, 3).map((r) => `${r.name} (${r.priorityBadge})`).join(", ")}`);
        } else {
            list.push("📉 สุขภาพสต๊อกดี ไม่พบสินค้าค้างสต๊อกหรือเสี่ยงหมดอายุ");
        }
        if (ctx.peakDay && ctx.weakDay) {
            list.push(`📅 ${ctx.peakDay.name}ขายดีสุด (เฉลี่ย ฿${fmtInt(ctx.peakDay.avgRev)}/วัน) • ${ctx.weakDay.name}เงียบสุด (฿${fmtInt(ctx.weakDay.avgRev)}/วัน)`);
        }
        return list;
    }

    function classifyTrendBadge(trendPct, isNew, hasWin, saleDays) {
        if (isNew) return { badge: "🆕 เริ่มติดตลาด", tone: "violet" };
        if (!hasWin) return { badge: saleDays >= 2 ? "🔥 ขายดีช่วงแรก" : "🆕 ข้อมูลเริ่มต้น", tone: "violet" };
        if (trendPct >= 25) return { badge: `🚀 โตแรง +${Math.round(trendPct)}%`, tone: "ok" };
        if (trendPct >= 8) return { badge: `📈 ขาขึ้น +${Math.round(trendPct)}%`, tone: "ok" };
        if (trendPct <= -20) return { badge: `📉 ชะลอตัว ${Math.round(trendPct)}%`, tone: "danger" };
        return { badge: "🔥 ขายดีสม่ำเสมอ", tone: "warn" };
    }

    function classifyStockReadiness(stock, predictedQty, daysLeft, horizon) {
        if (stock <= 0) return { text: "❌ หมดสต็อก!", tone: "danger" };
        if (predictedQty > stock || daysLeft < Math.max(5, Math.floor(horizon / 2))) {
            return { text: daysLeft < 999 ? `⚠️ พออีก ~${daysLeft} วัน` : "⚠️ ควรเติมสต็อก", tone: "warn" };
        }
        return { text: daysLeft < 999 ? `✅ พอขาย ~${daysLeft} วัน` : "✅ พร้อมขาย", tone: "ok" };
    }

    // =========================================================================
    // RENDER DASHBOARD, CHART, SALES & STOCK
    // =========================================================================
    function renderDashboard(f) {
        $("dashSubtitle").textContent = f.actualDataSpanDays > 0
            ? `ข้อมูลล่าสุด ณ ${formatDateTime(f.generatedAt)} • ข้อมูลจริง ${f.actualDataSpanDays} วัน (ในกรอบ ${f.historyDays} วัน) → พยากรณ์ ${f.forecastHorizonDays} วันหน้า`
            : `ข้อมูลล่าสุด ณ ${formatDateTime(f.generatedAt)} • ยังไม่มียอดขายในช่วงนี้ (แสดงสถานะสต๊อกคงเหลือ)`;

        $("kpiHistTitle").textContent = `ยอดขายจริง (${f.historyDays} วัน)`;
        $("kpiHistSales").textContent = `฿${fmtMoney(f.historyRevenue)}`;
        $("kpiHistSub").textContent = `${fmtInt(f.historyBills)} บิล | เฉลี่ย ฿${fmtInt(f.avgDailyRevenue)}/วัน | ฿${fmtInt(f.avgBasketValue)}/บิล`;
        $("kpiTodayMonth").textContent = `วันนี้ ฿${fmtInt(f.todaySales)} (${f.todayBills} บิล) | เดือนนี้ ฿${fmtInt(f.monthSales)}`;

        $("kpiGrossProfit").textContent = f.historyRevenue > 0 && f.historyGrossProfit > 0
            ? `฿${fmtMoney(f.historyGrossProfit)}`
            : (f.historyRevenue > 0 ? "ยังไม่ระบุทุน" : "฿0.00");
        $("kpiGrossMargin").textContent = f.missingCostCount > 0
            ? `อัตรากำไร ~${f.historyGrossMarginPct}% (ขาดทุน ${f.missingCostCount} ตัว)`
            : `อัตรากำไรขั้นต้น ${f.historyGrossMarginPct}%`;
        $("kpiOpExpense").textContent = `รายจ่ายดำเนินงาน ฿${fmtInt(f.historyOpExpenses)}`;

        $("kpiForeTitle").textContent = `🔮 คาดการณ์ ${f.forecastHorizonDays} วันหน้า`;
        $("kpiForeSales").textContent = `฿${fmtInt(f.projectedRevenue)}`;
        $("kpiForeRange").textContent = `ช่วง ฿${fmtInt(f.projectedLow)} – ฿${fmtInt(f.projectedHigh)} (~${fmtInt(f.projectedBills)} บิล)`;

        const trendEl = $("kpiTrendBadge");
        if (!f.hasEnoughSales) {
            trendEl.className = "badge badge-neutral";
            trendEl.textContent = f.historyBills > 0 ? "🆕 ช่วงสะสมข้อมูล (<3 วัน)" : "ยังไม่มีข้อมูลขาย";
        } else if (f.revenueTrendPct >= 5) {
            trendEl.className = "badge badge-ok";
            trendEl.textContent = `🚀 แนวโน้มขาขึ้น +${f.revenueTrendPct}%`;
        } else if (f.revenueTrendPct <= -5) {
            trendEl.className = "badge badge-danger";
            trendEl.textContent = `📉 ชะลอตัว ${f.revenueTrendPct}%`;
        } else {
            trendEl.className = "badge badge-violet";
            trendEl.textContent = `➡️ ทรงตัว (${f.revenueTrendPct > 0 ? "+" : ""}${f.revenueTrendPct}%)`;
        }

        $("kpiInvCost").textContent = `฿${fmtMoney(f.totalInventoryCost)}`;
        $("kpiInvRetail").textContent = `มูลค่าขาย ฿${fmtInt(f.totalInventoryRetail)} | ${fmtInt(f.totalStockUnits)} ชิ้น`;
        $("kpiInvHealth").textContent = `หมดสต๊อก ${f.outOfStockCount} | ใกล้หมด ${f.lowStockCount} | ใกล้หมดอายุ ${f.nearExpiryCount + f.expiredCount}`;
        $("kpiInvHealth").style.color = (f.outOfStockCount + f.expiredCount) > 0 ? "#b91c1c" : "#065f46";

        $("kpiIncCount").textContent = `+${f.increaseList.length} ตัว`;
        $("kpiIncBudget").textContent = `งบ ~฿${fmtInt(f.reorderBudget)}`;
        $("kpiRedCount").textContent = `${f.reduceList.length} ตัว`;
        $("kpiRedCap").textContent = `ทุนจม ฿${fmtInt(f.reducibleCapital)}`;

        renderForecastSvgChart(f);
        renderWeekdayBars(f);

        $("chartHintText").textContent = f.dailySeries.every((p) => p.revenue === 0)
            ? "💡 ยังไม่มียอดขายในช่วงนี้ — กราฟจะแสดงอัตโนมัติเมื่อมียอดขายซิงค์ขึ้น Google Sheets"
            : `คาดการณ์เฉลี่ยวันละ ฿${fmtInt(f.projectedAvgDaily)} | กำไรขั้นต้นคาดการณ์ ~฿${fmtInt(f.projectedGrossProfit)} ใน ${f.forecastHorizonDays} วันหน้า`;

        $("executiveBulletsContainer").innerHTML = f.bullets
            .map((b) => `<div class="insight-item">${esc(b)}</div>`)
            .join("");

        renderDashboardTablesOnly();
    }

    function renderForecastSvgChart(f) {
        const container = $("forecastChartContainer");
        const series = f.dailySeries || [];
        if (series.length === 0) {
            container.innerHTML = `<div style="padding: 40px; text-align:center; color:#64748b;">ไม่มีข้อมูลกราฟ</div>`;
            return;
        }

        const w = Math.max(620, series.length * 14);
        const h = 230;
        const left = 52;
        const right = 14;
        const top = 18;
        const bottom = 28;
        const plotW = w - left - right;
        const plotH = h - top - bottom;

        const rawMax = Math.max(...series.map((p) => (p.isForecast ? Math.max(p.revenue, p.high) : p.revenue)), 0);
        const maxY = rawMax > 0 ? rawMax * 1.12 : 1000;
        const n = series.length;
        const slot = plotW / n;
        const barW = clamp(slot * 0.62, 4, 24);
        const stepLabel = n <= 16 ? 2 : (n <= 35 ? 5 : 8);

        let svg = `<svg viewBox="0 0 ${w} ${h}" style="width:100%; min-width:520px; height:230px; display:block;">`;

        for (let g = 0; g <= 4; g++) {
            const ratio = g / 4;
            const y = top + plotH * (1 - ratio);
            const val = maxY * ratio;
            svg += `<line x1="${left}" y1="${y}" x2="${left + plotW}" y2="${y}" stroke="${g === 0 ? "#94a3b8" : "#e2e8f0"}" ${g === 0 ? "" : 'stroke-dasharray="3 3"'} />`;
            svg += `<text x="${left - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#64748b">${esc(formatCompactBaht(val))}</text>`;
        }

        const firstForeIdx = series.findIndex((p) => p.isForecast);
        if (firstForeIdx > 0) {
            const divX = left + firstForeIdx * slot;
            svg += `<line x1="${divX}" y1="${top - 4}" x2="${divX}" y2="${top + plotH}" stroke="#7c3aed" stroke-width="1.4" stroke-dasharray="4 3" />`;
            svg += `<rect x="${Math.min(divX + 3, w - 68)}" y="2" width="60" height="15" rx="4" fill="#ede9fe" />`;
            svg += `<text x="${Math.min(divX + 33, w - 38)}" y="12.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="#5b21b6">คาดการณ์ →</text>`;
        }

        const trendPts = [];
        for (let i = 0; i < n; i++) {
            const pt = series[i];
            const cx = left + (i + 0.5) * slot;
            const bx = cx - barW / 2;

            if (pt.isForecast && pt.high > 0) {
                const hy = top + plotH * (1 - clamp(pt.high / maxY, 0, 1));
                const ly = top + plotH * (1 - clamp(pt.low / maxY, 0, 1));
                svg += `<rect x="${cx - Math.min(slot * 0.85, barW + 4) / 2}" y="${hy}" width="${Math.min(slot * 0.85, barW + 4)}" height="${Math.max(2, ly - hy)}" rx="3" fill="rgba(139,92,246,0.16)" />`;
            }

            const ratio = clamp(pt.revenue / maxY, 0, 1);
            const bh = pt.revenue > 0 ? Math.max(2, plotH * ratio) : 0;
            const by = top + plotH - bh;
            const fill = pt.isForecast ? "#8b5cf6" : (pt.isToday ? "#1d4ed8" : "#3b82f6");
            const tip = pt.isForecast
                ? `${pt.thaiDay} ${pt.shortLabel} (คาดการณ์): ฿${fmtInt(pt.revenue)} (ช่วง ฿${fmtInt(pt.low)}–฿${fmtInt(pt.high)}, ~${pt.bills} บิล)`
                : `${pt.thaiDay} ${pt.shortLabel} (${pt.isToday ? "วันนี้" : "จริง"}): ฿${fmtMoney(pt.revenue)} (${pt.bills} บิล)`;

            if (bh > 0) {
                svg += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${fill}" opacity="${pt.isForecast ? "0.84" : "0.95"}"><title>${esc(tip)}</title></rect>`;
            }
            svg += `<rect x="${left + i * slot}" y="${top}" width="${slot}" height="${plotH}" fill="transparent"><title>${esc(tip)}</title></rect>`;

            let sum = 0;
            let cnt = 0;
            for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) {
                sum += series[k].revenue;
                cnt++;
            }
            const maY = top + plotH * (1 - clamp((sum / cnt) / maxY, 0, 1));
            trendPts.push(`${cx.toFixed(1)},${maY.toFixed(1)}`);

            if (i % stepLabel === 0 || i === n - 1 || pt.isToday) {
                svg += `<text x="${cx}" y="${top + plotH + 15}" text-anchor="middle" font-size="9.5" font-weight="${pt.isToday ? "700" : "400"}" fill="${pt.isToday ? "#1d4ed8" : "#64748b"}">${pt.isToday ? "วันนี้" : esc(pt.shortLabel)}</text>`;
            }
        }

        if (trendPts.length >= 2) {
            svg += `<polyline points="${trendPts.join(" ")}" fill="none" stroke="#f59e0b" stroke-width="2.2" pointer-events="none" />`;
        }
        svg += "</svg>";
        container.innerHTML = svg;
    }

    function renderWeekdayBars(f) {
        const stats = f.weekdayStats || [];
        const maxAvg = Math.max(...stats.map((s) => s.avgRev), 0);
        $("weekdayStatsContainer").innerHTML = stats.map((w) => {
            const pct = maxAvg > 0 ? Math.max(4, Math.round((w.avgRev / maxAvg) * 100)) : 0;
            const fillCls = w.isPeak ? "peak" : (w.isWeak ? "weak" : "");
            const badge = w.isPeak
                ? `<span class="badge badge-ok">🔥 ขายดีสุด</span>`
                : (w.isWeak ? `<span class="badge badge-warn">🌙 เงียบสุด</span>` : `<span class="badge badge-neutral">${w.factor >= 1 ? "+" : ""}${Math.round((w.factor - 1) * 100)}%</span>`);
            return `
                <div class="weekday-row">
                    <strong>${esc(w.name)}</strong>
                    <div class="bar-track"><div class="bar-fill ${fillCls}" style="width:${pct}%"></div></div>
                    <span class="text-right" style="font-weight:600;">${maxAvg > 0 ? `฿${fmtInt(w.avgRev)}` : "-"}</span>
                    <div style="text-align:right;">${maxAvg > 0 ? badge : "-"}</div>
                </div>
            `;
        }).join("");
        $("tomorrowNoteBox").textContent = f.tomorrowNote;
    }

    function renderDashboardTablesOnly() {
        const f = state.forecast;
        if (!f) return;
        const q = $("txtDashFilter").value.trim().toLowerCase();

        const best = q ? f.bestSellers.filter((x) => x.name.toLowerCase().includes(q) || x.barcode.toLowerCase().includes(q)) : f.bestSellers;
        const inc = q ? f.increaseList.filter((x) => x.name.toLowerCase().includes(q) || x.barcode.toLowerCase().includes(q)) : f.increaseList;
        const red = q ? f.reduceList.filter((x) => x.name.toLowerCase().includes(q) || x.barcode.toLowerCase().includes(q)) : f.reduceList;

        $("pillBestCount").textContent = `${best.length} รายการ`;
        $("pillIncSummary").textContent = `${inc.length} รายการ • งบ ~฿${fmtInt(inc.reduce((s, x) => s + x.financialImpact, 0))}`;
        $("pillRedSummary").textContent = `${red.length} รายการ • ทุนจม ฿${fmtInt(red.reduce((s, x) => s + x.financialImpact, 0))}`;
        $("btnCopyReorder").disabled = inc.length === 0;

        $("tbodyBestSellers").innerHTML = best.length === 0
            ? `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:18px;">ไม่พบรายการขายดีในช่วงนี้</td></tr>`
            : best.map((b) => `
                <tr>
                    <td><strong>${b.rank}</strong></td>
                    <td>
                        <div style="font-weight:700;">${esc(b.name)}</div>
                        <div style="font-size:11px; color:#64748b;">${esc(b.barcode)} • ${esc(b.packNote)}</div>
                    </td>
                    <td class="text-right">${fmtInt(b.soldHistoryQty)} ชิ้น</td>
                    <td class="text-right">${b.dailyVel.toFixed(1)}/วัน</td>
                    <td><span class="badge badge-${b.trendTone}">${esc(b.trendBadge)}</span></td>
                    <td class="text-right"><strong>${fmtInt(b.predictedQty)} ชิ้น</strong> (฿${fmtInt(b.predictedRev)})</td>
                    <td class="text-right">${b.hasCost ? `฿${fmtInt(b.predictedProfit)} (${b.marginPct}%)` : "-"}</td>
                    <td><span class="badge badge-${b.stockTone}">${esc(b.stockText)}</span></td>
                </tr>
            `).join("");

        $("tbodyIncrease").innerHTML = inc.length === 0
            ? `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:18px;">สต๊อกสินค้าขายดียังเพียงพอ ไม่มีรายการที่ต้องสั่งเพิ่มเร่งด่วน</td></tr>`
            : inc.map((i) => `
                <tr>
                    <td><span class="badge badge-${i.priorityTone}">${esc(i.priorityBadge)}</span></td>
                    <td>
                        <div style="font-weight:700;">${esc(i.name)}</div>
                        <div style="font-size:11px; color:#047857;">${esc(i.barcode)}${i.packHint ? " • " + esc(i.packHint) : ""}</div>
                    </td>
                    <td class="text-right">${fmtInt(i.currentStock)} ชิ้น</td>
                    <td>${i.daysLeft >= 999 ? ">999 วัน" : (i.currentStock <= 0 ? "หมดสต็อก" : `~${i.daysLeft} วัน`)}</td>
                    <td class="text-right">${fmtInt(i.predictedDemand)} ชิ้น</td>
                    <td class="text-right" style="color:#047857; font-weight:800;">+${fmtInt(i.deltaQty)} ชิ้น</td>
                    <td class="text-right">${i.hasCost ? `~฿${fmtInt(i.financialImpact)}` : "-"}</td>
                    <td style="min-width:220px; font-size:12px; color:#334155;">${esc(i.reason)}</td>
                </tr>
            `).join("");

        $("tbodyReduce").innerHTML = red.length === 0
            ? `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:18px;">ไม่พบสินค้าค้างสต๊อก ขาลง หรือเสี่ยงหมดอายุ</td></tr>`
            : red.map((r) => `
                <tr>
                    <td><span class="badge badge-${r.priorityTone}">${esc(r.priorityBadge)}</span></td>
                    <td>
                        <div style="font-weight:700;">${esc(r.name)}</div>
                        <div style="font-size:11px; color:#64748b;">${esc(r.barcode)}</div>
                    </td>
                    <td class="text-right">${fmtInt(r.currentStock)} ชิ้น</td>
                    <td>${r.daysLeft >= 999 ? "ขายไม่ออก" : `~${r.daysLeft} วัน`}</td>
                    <td class="text-right" style="color:#b45309; font-weight:800;">฿${fmtInt(r.financialImpact)}</td>
                    <td style="min-width:250px;">
                        <div style="font-weight:700; color:#9a3412; font-size:12px;">${esc(r.actionText)}</div>
                        <div style="font-size:11.5px; color:#475569;">${esc(r.reason)}</div>
                    </td>
                </tr>
            `).join("");
    }

    function copyReorderList() {
        const f = state.forecast;
        if (!f || f.increaseList.length === 0) return;
        const lines = [
            `📋 รายการแนะนำสั่งซื้อสินค้าเพิ่ม — ${$("hdrStoreName").textContent} (${formatDateTime(new Date())})`,
            `คาดการณ์สำหรับ ${f.forecastHorizonDays} วันข้างหน้า`,
            "--------------------------------------------------",
            ...f.increaseList.map((x, idx) =>
                `${idx + 1}. ${x.name} [${x.barcode}] — สั่งเพิ่ม +${x.deltaQty} ชิ้น${x.packHint ? ` (${x.packHint})` : ""}${x.hasCost ? ` | งบ ~฿${fmtInt(x.financialImpact)}` : ""}`
            ),
            "--------------------------------------------------",
            `รวม ${f.increaseList.length} รายการ | งบประมาณ ~฿${fmtInt(f.reorderBudget)}`
        ];
        navigator.clipboard?.writeText(lines.join("\n"))
            .then(() => alert(`คัดลอกรายการสั่งซื้อ ${f.increaseList.length} รายการเรียบร้อยแล้ว`))
            .catch(() => alert("ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาลองใหม่อีกครั้ง"));
    }

    function renderSalesTable() {
        if (!state.rawData) return;
        const q = $("txtSalesSearch").value.trim().toLowerCase();
        const range = $("selSalesRange").value;
        const statusFilter = $("selSalesStatus").value;
        const today = startOfDay(new Date());

        let rows = state.rawData.sales.filter((s) => {
            if (statusFilter === "active" && s.isVoided) return false;
            if (statusFilter === "void" && !s.isVoided) return false;

            if (range === "today" && startOfDay(s.saleDate).getTime() !== today.getTime()) return false;
            else if (range === "7" && s.saleDate < addDays(today, -6)) return false;
            else if (range === "30" && s.saleDate < addDays(today, -29)) return false;

            if (q) {
                const hay = `${s.invoiceNo} ${s.memberName} ${s.memberPhone} ${s.itemsSummary} ${s.promoText}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });

        const totalValid = rows.filter((r) => !r.isVoided).reduce((s, r) => s + r.totalAmount, 0);
        $("salesSummaryLine").textContent = `แสดง ${fmtInt(rows.length)} บิล • ยอดขายสุทธิรวม (ไม่รวมบิลยกเลิก): ฿${fmtMoney(totalValid)}`;

        $("tbodySales").innerHTML = rows.length === 0
            ? `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:24px;">ไม่พบบิลขายที่ตรงกับเงื่อนไข</td></tr>`
            : rows.slice(0, 500).map((s, idx) => `
                <tr>
                    <td><strong>${esc(s.invoiceNo)}</strong></td>
                    <td style="white-space:nowrap;">${esc(formatDateTime(s.saleDate))}</td>
                    <td>
                        <div>${esc(s.memberName)}</div>
                        ${s.memberPhone ? `<div style="font-size:11px; color:#64748b;">${esc(s.memberPhone)}</div>` : ""}
                    </td>
                    <td style="max-width:260px;">${esc(s.itemsSummary)}</td>
                    <td style="font-size:11.5px;">${esc(s.promoText !== "-" ? `${s.promoText} (${s.discountGiftText})` : s.discountGiftText)}</td>
                    <td class="text-right" style="font-weight:700;">฿${fmtMoney(s.totalAmount)}</td>
                    <td><span class="badge ${s.isVoided ? "badge-danger" : "badge-ok"}">${esc(s.status)}</span></td>
                    <td><button class="btn btn-outline btn-sm" type="button" data-bill-idx="${idx}">ดูรายการ</button></td>
                </tr>
            `).join("");

        const displayed = rows.slice(0, 500);
        $("tbodySales").querySelectorAll("button[data-bill-idx]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const bill = displayed[Number(btn.dataset.billIdx)];
                if (bill) openBillDetailModal(bill);
            });
        });
    }

    function openBillDetailModal(bill) {
        $("modalTitle").textContent = `🧾 รายละเอียดบิล ${bill.invoiceNo}`;
        const itemsHtml = bill.items && bill.items.length > 0
            ? `<table>
                <thead><tr><th>สินค้า</th><th class="text-right">จำนวน</th><th class="text-right">ราคา/หน่วย</th><th class="text-right">รวม</th></tr></thead>
                <tbody>
                    ${bill.items.map((it) => `
                        <tr>
                            <td>${esc(it.productName)}${it.isFreeGift ? ' <span class="badge badge-violet">🎁 แถมฟรี</span>' : ""}</td>
                            <td class="text-right">${it.qty}</td>
                            <td class="text-right">฿${fmtMoney(it.unitPrice)}</td>
                            <td class="text-right"><strong>฿${fmtMoney(it.subTotal)}</strong></td>
                        </tr>
                    `).join("")}
                </tbody>
               </table>`
            : `<div class="alert alert-info">${esc(bill.itemsSummary || "ไม่มีข้อมูลรายการย่อย")}</div>`;

        $("modalBody").innerHTML = `
            <div style="font-size:13px; margin-bottom:10px; color:#334155;">
                <div><strong>วันที่:</strong> ${esc(formatDateTime(bill.saleDate))} | <strong>สถานะ:</strong> ${esc(bill.status)}</div>
                <div><strong>ลูกค้า:</strong> ${esc(bill.memberName)} ${bill.memberPhone ? `(${esc(bill.memberPhone)})` : ""}</div>
                <div><strong>ยอดก่อนลด:</strong> ฿${fmtMoney(bill.grossAmount)} | <strong>ส่วนลด/โปร:</strong> ${esc(bill.discountGiftText)}</div>
                <div style="font-size:15px; margin-top:4px;"><strong>ยอดรวมสุทธิ: ฿${fmtMoney(bill.totalAmount)}</strong></div>
            </div>
            <div class="table-scroll">${itemsHtml}</div>
        `;
        $("detailModal").classList.remove("hidden");
    }

    function renderStockTable() {
        if (!state.rawData) return;
        const q = $("txtStockSearch").value.trim().toLowerCase();
        const filter = $("selStockFilter").value;

        let list = state.rawData.products.filter((p) => {
            if (q && !p.name.toLowerCase().includes(q) && !p.barcode.toLowerCase().includes(q)) return false;
            if (filter === "out") return p.effectiveStockQty <= 0;
            if (filter === "low") return (!p.isLinkedPack && p.stockQty < 5) || p.effectiveStockQty <= 0;
            if (filter === "expiry") return p.daysUntilExpiry !== null && p.daysUntilExpiry <= 30 && p.effectiveStockQty > 0;
            if (filter === "food") return p.isFoodItem;
            if (filter === "pack") return p.isLinkedPack;
            return true;
        });

        const baseOnly = list.filter((p) => !p.isLinkedPack);
        const totalCostVal = baseOnly.reduce((s, p) => s + Math.max(0, p.stockQty) * p.costPrice, 0);
        $("stockSummaryLine").textContent = `แสดง ${fmtInt(list.length)} รายการ • มูลค่าทุนรวม (สินค้าหลัก): ฿${fmtMoney(totalCostVal)}`;

        $("tbodyStock").innerHTML = list.length === 0
            ? `<tr><td colspan="8" style="text-align:center; color:#64748b; padding:24px;">ไม่พบสินค้าที่ตรงกับเงื่อนไข</td></tr>`
            : list.map((p, idx) => {
                const stockBadge = p.effectiveStockQty <= 0
                    ? `<span class="badge badge-danger">${p.isLinkedPack ? "ชิ้นแม่ไม่พอ" : "หมด (0)"}</span>`
                    : (!p.isLinkedPack && p.stockQty < 5
                        ? `<span class="badge badge-warn">${fmtInt(p.stockQty)} ชิ้น</span>`
                        : `<span class="badge badge-ok">${fmtInt(p.effectiveStockQty)} ${p.isLinkedPack ? "แพ็ค" : "ชิ้น"}</span>`);

                let expHtml = `<span style="color:#64748b;">-</span>`;
                if (p.effectiveExpiryDate) {
                    const d = p.daysUntilExpiry;
                    const cls = d <= 0 ? "badge-danger" : (d <= 30 ? "badge-warn" : "badge-neutral");
                    const label = d < 0 ? `หมดอายุ ${-d} วัน` : (d === 0 ? "หมดอายุวันนี้!" : `${formatShortDate(p.effectiveExpiryDate)} (${d} วัน)`);
                    expHtml = `<span class="badge ${cls}">${esc(label)}</span>`;
                }

                const costVal = p.isLinkedPack ? 0 : Math.max(0, p.stockQty) * p.costPrice;
                const lotsBtn = p.lots && p.lots.length > 0
                    ? ` <button class="btn btn-outline btn-sm" type="button" data-prod-idx="${idx}">${p.lots.length} ล็อต</button>`
                    : "";

                return `
                    <tr>
                        <td><code>${esc(p.barcode)}</code></td>
                        <td>
                            <div style="font-weight:700;">${esc(p.name)}</div>
                            ${p.isLinkedPack ? `<div style="font-size:11px; color:#64748b;">อ้างอิง ${esc(p.baseProductName || p.baseProductBarcode)} x${p.unitsPerPack}</div>` : ""}
                        </td>
                        <td>${p.isLinkedPack ? `แพ็ค x${p.unitsPerPack}` : (p.isFoodItem ? "ของกิน" : "ทั่วไป")}</td>
                        <td class="text-right">${p.isLinkedPack ? `฿${fmtMoney(p.effectiveCostPrice || 0)}` : `฿${fmtMoney(p.costPrice)}`}</td>
                        <td class="text-right" style="font-weight:700;">฿${fmtMoney(p.price)}</td>
                        <td class="text-right">${stockBadge}</td>
                        <td class="text-right">${p.isLinkedPack ? "-" : `฿${fmtMoney(costVal)}`}</td>
                        <td>${expHtml}${lotsBtn}</td>
                    </tr>
                `;
            }).join("");

        $("tbodyStock").querySelectorAll("button[data-prod-idx]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const prod = list[Number(btn.dataset.prodIdx)];
                if (prod) openProductLotsModal(prod);
            });
        });
    }

    function openProductLotsModal(prod) {
        $("modalTitle").textContent = `📦 ล็อตคงเหลือ: ${prod.name}`;
        const today = startOfDay(new Date());
        $("modalBody").innerHTML = `
            <div class="table-scroll">
                <table>
                    <thead><tr><th>รหัสล็อต</th><th>วันรับเข้า</th><th>วันหมดอายุ</th><th class="text-right">คงเหลือ</th><th class="text-right">ทุน/ชิ้น</th><th>หมายเหตุ</th></tr></thead>
                    <tbody>
                        ${prod.lots.map((l) => {
                            const d = l.expiryDate ? daysUntil(l.expiryDate, today) : null;
                            const expText = l.expiryDate
                                ? `${formatShortDate(l.expiryDate)} (${d <= 0 ? `หมดอายุ ${-d} วัน` : `อีก ${d} วัน`})`
                                : "ไม่ระบุวัน";
                            return `
                                <tr>
                                    <td><strong>${esc(l.lotCode)}</strong></td>
                                    <td>${l.receivedAt ? esc(formatShortDate(l.receivedAt)) : "-"}</td>
                                    <td>${esc(expText)}</td>
                                    <td class="text-right">${l.remainingQty} / ${l.initialQty}</td>
                                    <td class="text-right">฿${fmtMoney(l.costPrice)}</td>
                                    <td>${esc(l.note || "-")}</td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
        $("detailModal").classList.remove("hidden");
    }

    function closeModal() {
        $("detailModal").classList.add("hidden");
    }

    function switchPortalTab(tabName) {
        document.querySelectorAll(".tab-btn").forEach((b) => {
            b.classList.toggle("active", b.dataset.tab === tabName);
        });
        document.querySelectorAll(".tab-panel").forEach((p) => {
            p.classList.toggle("hidden", p.id !== `tab-${tabName}`);
        });
    }

    // =========================================================================
    // HELPERS
    // =========================================================================
    function showAuthStatus(msg, level) {
        const el = $("authStatusBox");
        el.textContent = msg;
        el.className = `alert alert-${level || "info"}`;
        el.classList.remove("hidden");
    }

    function showPortalBanner(msg, level) {
        const el = $("portalStatusBanner");
        el.textContent = msg;
        el.className = `alert alert-${level || "info"}`;
        el.classList.remove("hidden");
    }

    function hidePortalBanner() {
        $("portalStatusBanner").classList.add("hidden");
    }

    function extractSpreadsheetId(raw) {
        if (!raw) return "";
        const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (m) return m[1];
        return /^[a-zA-Z0-9-_]{20,}$/.test(raw) ? raw : "";
    }

    function cellText(row, idx) {
        if (!row || idx >= row.length || row[idx] === null || row[idx] === undefined) return "";
        return String(row[idx]).trim();
    }

    function cleanCode(str) {
        return (str || "").replace(/^'+/, "").trim();
    }

    function parseNum(val) {
        if (typeof val === "number") return Number.isFinite(val) ? val : 0;
        const cleaned = String(val || "").replace(/[฿,\s]/g, "").trim();
        const num = Number(cleaned);
        return Number.isFinite(num) ? num : 0;
    }

    function parseSheetDate(val, dateOnly) {
        if (val === null || val === undefined || val === "") return null;
        if (typeof val === "number" && val > 0 && val < 2958466) {
            const utcMs = Date.UTC(1899, 11, 30) + Math.round(val * 86400000);
            const u = new Date(utcMs);
            return dateOnly
                ? new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate())
                : new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
        }
        const str = String(val).replace(/^'+/, "").trim();
        if (!str || str === "-") return null;
        if (/^\d+(\.\d+)?$/.test(str)) return parseSheetDate(Number(str), dateOnly);

        const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (isoMatch) {
            return new Date(
                Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]),
                Number(isoMatch[4] || 0), Number(isoMatch[5] || 0), Number(isoMatch[6] || 0)
            );
        }
        const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (dmyMatch) {
            let yr = Number(dmyMatch[3]);
            if (yr > 2400) yr -= 543;
            return new Date(
                yr, Number(dmyMatch[2]) - 1, Number(dmyMatch[1]),
                Number(dmyMatch[4] || 0), Number(dmyMatch[5] || 0), Number(dmyMatch[6] || 0)
            );
        }
        const fallback = new Date(str);
        return Number.isNaN(fallback.getTime()) ? null : fallback;
    }

    function parseFallbackSummaryItems(summary, byName, billTotal) {
        if (!summary) return [];
        const parts = [];
        const re = /(.+?)\s+x(\d+)(?:,\s*|$)/g;
        let m;
        while ((m = re.exec(summary)) !== null) {
            const name = m[1].trim();
            const qty = Math.max(1, Number(m[2]));
            const prod = byName.get(name.toLowerCase());
            parts.push({
                barcode: prod ? prod.barcode : "",
                productName: name,
                qty,
                unitPrice: prod ? prod.price : 0,
                subTotal: prod ? prod.price * qty : 0
            });
        }
        if (parts.length === 1 && parts[0].subTotal === 0 && billTotal > 0) {
            parts[0].subTotal = billTotal;
        }
        return parts;
    }

    function computeRecencyWeightedMean(values) {
        if (values.length === 0) return 0;
        let wSum = 0;
        let wTot = 0;
        const n = values.length;
        for (let i = 0; i < n; i++) {
            const age = (n - 1) - i;
            const w = Math.exp(-age / Math.max(7, n * 0.35));
            wSum += values[i] * w;
            wTot += w;
        }
        return wTot > 0 ? wSum / wTot : 0;
    }

    function computeDampedSlope(values) {
        const n = values.length;
        if (n < 6) return 0;
        const meanX = (n - 1) / 2;
        const meanY = values.reduce((a, b) => a + b, 0) / n;
        if (meanY <= 0) return 0;
        let num = 0;
        let den = 0;
        for (let i = 0; i < n; i++) {
            const dx = i - meanX;
            num += dx * (values[i] - meanY);
            den += dx * dx;
        }
        if (den <= 0) return 0;
        const maxSlope = meanY * 0.015;
        return clamp((num / den) * 0.55, -maxSlope, maxSlope);
    }

    function computeRelativeUncertainty(values) {
        if (values.length < 4) return 0.25;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        if (mean <= 0) return 0.25;
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
        return clamp((Math.sqrt(variance) / mean) * 0.35, 0.1, 0.3);
    }

    function startOfDay(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function addDays(d, days) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    }

    function daysUntil(exp, today) {
        return Math.round((startOfDay(exp) - today) / 86400000);
    }

    function dateKey(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    function formatShortDate(d) {
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    function formatDateTime(d) {
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }

    function getShortThaiDay(dow) {
        return ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][dow] || "";
    }

    function formatCompactBaht(v) {
        if (v >= 1000000) return `฿${(v / 1000000).toFixed(1)}M`;
        if (v >= 1000) return `฿${(v / 1000).toFixed(1)}k`;
        return `฿${Math.round(v)}`;
    }

    function fmtInt(n) {
        return Math.round(Number(n) || 0).toLocaleString("en-US");
    }

    function fmtMoney(n) {
        return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function esc(str) {
        return String(str ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
})();

// ============ NAWIGACJA ZAKŁADKAMI ============
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

// ============ WSPÓLNE NARZĘDZIA SORTOWANIA TABEL (klikalne nagłówki) ============
// dd-mm-yyyy -> 'yyyymmdd' (porównywalny string); inaczej null
function dmyToSortable(v) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(v ?? '').trim());
    return m ? m[3] + m[2] + m[1] : null;
}
// liczba "czysta" = round-trip identyczny. "0123" odpada (wiodące 0) -> PESEL leci jako tekst
function isPlainNumber(v) {
    const s = String(v ?? '').trim();
    return s !== '' && String(Number(s)) === s;
}
// Typ kolumny ustalany RAZ na podstawie WSZYSTKICH wartości (spójne, transitywne sortowanie)
function detectType(values) {
    let any = false, allNum = true, allDate = true;
    for (const v of values) {
        if (v === '' || v == null) continue;        // puste pomijamy przy wykrywaniu typu
        any = true;
        if (dmyToSortable(v) !== null) { allNum = false; continue; }
        allDate = false;
        if (!isPlainNumber(v)) allNum = false;
    }
    if (!any) return 'str';
    if (allDate) return 'date';
    if (allNum)  return 'num';                       // tylko gdy NIC nie ma wiodącego zera
    return 'str';
}
function comparatorFor(type) {
    if (type === 'num') {
        return (a, b) => {
            const x = (a === '' || a == null) ? Infinity : Number(a);
            const y = (b === '' || b == null) ? Infinity : Number(b);
            return x - y;                            // puste na koniec
        };
    }
    if (type === 'date') {
        return (a, b) => (dmyToSortable(a) ?? '99999999').localeCompare(dmyToSortable(b) ?? '99999999');
    }
    // tekst: ścisły leksykalny (numeric:false), żeby PESEL z wiodącym 0 sortował się poprawnie
    return (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'pl', { numeric: false });
}

// ============ WSPÓLNA WARSTWA AUTORYZACJI (tokeny + apiFetch) ============
const Auth = (function () {
    const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:8000'
        : 'https://rodo-1.onrender.com';

    const getAccess  = () => localStorage.getItem('access_token');
    const getRefresh = () => localStorage.getItem('refresh_token');
    const setAccess  = (t) => localStorage.setItem('access_token', t);
    function clear() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    }

    function decodeJwt(token) {
        try {
            const payload = token.split('.')[1];
            const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decodeURIComponent(escape(json)));
        } catch (e) { return null; }
    }

    function isExpired(token) {
        const p = decodeJwt(token);
        return !p || (p.exp && p.exp * 1000 <= Date.now());
    }

    // Odśwież access token używając refresh tokenu. Zwraca nowy access albo null.
    async function refreshAccessToken() {
        const rt = getRefresh();
        if (!rt || isExpired(rt)) return null;
        try {
            const res = await fetch(`${API}/refresh`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + rt }
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (data.access_token) { setAccess(data.access_token); return data.access_token; }
            return null;
        } catch (e) { return null; }
    }

    // fetch z Bearer access tokenem + automatycznym odświeżeniem przy 401 (jeden raz).
    async function apiFetch(path, options = {}, _retried = false) {
        let token = getAccess();
        if (token && isExpired(token)) {
            token = await refreshAccessToken();   // wygasł — odśwież zanim wyślesz
        }
        const headers = Object.assign({}, options.headers || {});
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const url = path.startsWith('http') ? path : API + path;
        const res = await fetch(url, Object.assign({}, options, { headers }));

        if (res.status === 401 && !_retried) {
            const newToken = await refreshAccessToken();
            if (newToken) return apiFetch(path, options, true);   // ponów raz
            clear();
            document.dispatchEvent(new CustomEvent('auth:logout'));
        }
        return res;
    }

    return { API, getAccess, getRefresh, setAccess, clear, decodeJwt, isExpired, refreshAccessToken, apiFetch };
})();

// ============ SEKCJA UPLOAD: WCZYTAJ DANE ============
(function () {
    const dropzone      = document.getElementById('dropzone');
    const fileInput     = document.getElementById('file-input');
    const fileInfoCard  = document.getElementById('file-info-card');
    const fileInfoIcon  = document.getElementById('file-info-icon');
    const fileInfoName  = document.getElementById('file-info-name');
    const fileInfoMeta  = document.getElementById('file-info-meta');
    const fileClearBtn  = document.getElementById('file-clear-btn');
    const uploadOptions = document.getElementById('upload-options');
    const uploadStats   = document.getElementById('upload-stats');
    const statsGrid     = document.getElementById('stats-grid');
    const csvOptions    = document.getElementById('csv-options');
    const csvSeparator  = document.getElementById('csv-separator');
    const previewEmpty  = document.getElementById('preview-empty');
    const previewContent= document.getElementById('preview-content');
    const previewError  = document.getElementById('preview-error');
    const previewErrorMsg=document.getElementById('preview-error-msg');
    const previewActions= document.getElementById('preview-actions');
    const btnCopy       = document.getElementById('btn-copy');
    const viewBtns      = document.querySelectorAll('.view-btn');

    let currentFileText = '';
    let currentFileType = '';
    let currentView     = 'formatted';
    let currentFile     = null;
    let csvSort         = null;   // { col: indexKolumny, dir: 'asc'|'desc' } | null = kolejność z pliku
    const MAX_FILE_SIZE = 50 * 1024 * 1024;

    // --- Dropzone kliknięcie ---
    dropzone.addEventListener('click', () => fileInput.click());

    // --- Drag & Drop ---
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    // --- Input file ---
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    // --- Separator CSV ---
    csvSeparator.addEventListener('change', () => {
        if (currentFileType === 'csv') renderPreview();
    });

    // --- Przełącznik widoku ---
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            if (currentFileText) renderPreview();
        });
    });

    // --- Wyczyść plik ---
    fileClearBtn.addEventListener('click', clearFile);

    // --- Pobierz szablon CSV (poprawne nagłówki wymagane przez backend + przykładowy wiersz) ---
    const btnDownloadTemplate = document.getElementById('btn-download-template');
    if (btnDownloadTemplate) btnDownloadTemplate.addEventListener('click', () => {
        const header  = 'first_name,last_name,PESEL,email,phone,birth_date,purpose,consent';
        const example = 'Jan,Kowalski,90050512345,jan.kowalski@example.com,512 345 678,1990-05-12,rekrutacja,True';
        const csv = '﻿' + header + '\n' + example + '\n';   // BOM => poprawne polskie znaki w Excelu
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'szablon_danych.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    });

    // --- Kopiuj do schowka ---
    btnCopy.addEventListener('click', () => {
        navigator.clipboard.writeText(currentFileText).then(() => {
            btnCopy.textContent = '✅ Skopiowano';
            setTimeout(() => { btnCopy.textContent = '📋 Kopiuj'; }, 2000);
        });
    });

    const pipelineAction = document.getElementById('pipeline-action');

    const btnSendPipeline = document.createElement('button');
    btnSendPipeline.type = 'button';
    btnSendPipeline.className = 'pipeline-send-btn';
    btnSendPipeline.textContent = '📤 Prześlij do bazy';
    pipelineAction.appendChild(btnSendPipeline);

    const pipelineStatus = document.createElement('div');
    pipelineStatus.className = 'pipeline-status';
    pipelineStatus.style.display = 'none';
    pipelineAction.appendChild(pipelineStatus);

    // Po wysłaniu (sukces lub błąd) — możliwość wczytania kolejnego pliku do pipeline'u
    const btnLoadAnother = document.createElement('button');
    btnLoadAnother.type = 'button';
    btnLoadAnother.className = 'pipeline-another-btn';
    btnLoadAnother.textContent = '📂 Wczytaj kolejny plik';
    btnLoadAnother.style.display = 'none';
    pipelineAction.appendChild(btnLoadAnother);

    btnLoadAnother.addEventListener('click', () => {
        clearFile();
        fileInput.click();
    });

    if (!document.getElementById('spin-style')) {
        const s = document.createElement('style');
        s.id = 'spin-style';
        s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }

    function showPipelineStatus(type, message) {
        pipelineStatus.style.display    = 'block';
        pipelineStatus.style.border     = '';
        pipelineStatus.style.background = '';
        pipelineStatus.style.color      = '';

        if (type === 'loading') {
            pipelineStatus.style.background = 'rgba(74,158,255,0.12)';
            pipelineStatus.style.border     = '2px solid #4a9eff';
            pipelineStatus.style.color      = '#4a9eff';
            pipelineStatus.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite;margin-right:10px;">⏳</span> Przesyłanie do bazy...';
        } else if (type === 'success') {
            pipelineStatus.style.background = 'rgba(76,175,80,0.12)';
            pipelineStatus.style.border     = '2px solid #4caf50';
            pipelineStatus.style.color      = '#4caf50';
            pipelineStatus.innerHTML = '✅ Dodane do bazy!';
        } else if (type === 'error') {
            pipelineStatus.style.background = 'rgba(244,67,54,0.12)';
            pipelineStatus.style.border     = '2px solid #f44336';
            pipelineStatus.style.color      = '#f44336';
            pipelineStatus.innerHTML = '❌ ' + escapeHtml(message || 'Błąd wysyłania');
        } else {
            pipelineStatus.style.display = 'none';
        }
    }

    btnSendPipeline.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentFile) sendToPipeline(currentFile);
    });

    async function sendToPipeline(file){
        btnSendPipeline.disabled = true;
        showPipelineStatus('loading');
        try{
            const formData = new FormData();
            formData.append("file", file);

            // apiFetch dokłada Bearer access token i sam odświeża go przy 401
            const response = await Auth.apiFetch('/pipeline/run', {
                method: "POST",
                body: formData
            });

            if(!response.ok){
                // Wyciągnij dokładny komunikat błędu z backendu (pole "detail")
                let detail = `Błąd serwera (${response.status})`;
                try {
                    const data = await response.json();
                    if (typeof data.detail === 'string') {
                        detail = data.detail;
                    } else if (Array.isArray(data.detail)) {
                        detail = data.detail.map(d => d.msg).join(', ');
                    }
                } catch (e) { /* odpowiedź bez JSON-a — zostaje fallback */ }
                throw new Error(detail);
            }
            // Sukces: ukryj przycisk wysyłki, pokaż możliwość wczytania kolejnego pliku
            btnSendPipeline.style.display = 'none';
            showPipelineStatus('success');
            btnLoadAnother.style.display = '';
        }
        catch(error){
            console.error(error.message);
            showPipelineStatus('error', error.message);
            // Błąd: zostaw możliwość ponowienia oraz wczytania kolejnego pliku
            btnSendPipeline.disabled = false;
            btnLoadAnother.style.display = '';
        }
    }
    function handleFile(file) {
        if (file.size > MAX_FILE_SIZE) {
            showError(`Plik jest za duży (${formatBytes(file.size)}). Maksymalny rozmiar to 50 MB.`);
            return;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'json' && ext !== 'csv') {
            showError('Nieobsługiwany format pliku. Wybierz plik .json lub .csv');
            return;
        }

        currentFile     = file;
        currentFileType = ext;
        const reader = new FileReader();
        reader.onload = (e) => {
            currentFileText = e.target.result;
            showFileInfo(file);
            showOptions(ext);
            renderPreview();
        };
        reader.readAsText(file, 'UTF-8');
    }

    function showFileInfo(file) {
        fileInfoIcon.textContent = currentFileType === 'json' ? '🗂️' : '📊';
        fileInfoName.textContent = file.name;
        fileInfoMeta.textContent = `${formatBytes(file.size)} · ${currentFileType.toUpperCase()}`;
        fileInfoCard.style.display = 'flex';
    }

    function showOptions(ext) {
        uploadOptions.style.display = 'block';
        csvOptions.style.display = ext === 'csv' ? 'flex' : 'none';
        previewActions.style.display = 'flex';
        pipelineAction.style.display = 'block';
        btnSendPipeline.style.display = '';
        btnSendPipeline.disabled = false;
        btnLoadAnother.style.display = 'none';
        showPipelineStatus('hidden');
    }

    function clearFile() {
        currentFileText = '';
        currentFileType = '';
        currentFile     = null;
        csvSort         = null;
        btnSendPipeline.style.display = 'none';
        btnLoadAnother.style.display  = 'none';
        pipelineAction.style.display  = 'none';
        showPipelineStatus('hidden');
        fileInput.value = '';
        fileInfoCard.style.display  = 'none';
        uploadOptions.style.display = 'none';
        uploadStats.style.display   = 'none';
        previewContent.style.display= 'none';
        previewError.style.display  = 'none';
        previewActions.style.display= 'none';
        previewEmpty.style.display  = 'flex';
    }

    function renderPreview() {
        previewEmpty.style.display   = 'none';
        previewError.style.display   = 'none';
        previewContent.style.display = 'block';

        if (currentView === 'raw') {
            renderRaw();
            return;
        }

        if (currentFileType === 'json') renderJSON();
        else renderCSV();
    }

    function renderRaw() {
        previewContent.innerHTML = `<div class="raw-viewer">${escapeHtml(currentFileText)}</div>`;
        updateStats({ rows: currentFileText.split('\n').length, chars: currentFileText.length });
    }

    function renderJSON() {
        try {
            const parsed = JSON.parse(currentFileText);
            previewContent.innerHTML = `<div class="json-viewer">${syntaxHighlightJSON(JSON.stringify(parsed, null, 2))}</div>`;

            const rowCount = Array.isArray(parsed) ? parsed.length : (typeof parsed === 'object' ? Object.keys(parsed).length : 1);
            const keyCount = Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object'
                ? Object.keys(parsed[0]).length
                : (typeof parsed === 'object' ? Object.keys(parsed).length : 1);
            updateStats({ rows: rowCount, cols: keyCount, chars: currentFileText.length, type: 'JSON' });
        } catch (err) {
            showError(`Błąd parsowania JSON: ${err.message}`);
        }
    }

    function renderCSV() {
        const sep = csvSeparator.value === '\\t' ? '\t' : csvSeparator.value;
        const lines = currentFileText.trim().split(/\r?\n/).filter(l => l.trim() !== '');

        if (lines.length === 0) {
            showError('Plik CSV jest pusty.');
            return;
        }

        const headers = parseCSVLine(lines[0], sep);
        const dataRows = lines.slice(1).map(l => parseCSVLine(l, sep));

        const maxPreview = 500;
        const truncated = dataRows.length > maxPreview;
        // zachowujemy oryginalny numer wiersza (n) — kolumna "#" pokazuje go nawet po sortowaniu
        let displayed = dataRows.slice(0, maxPreview).map((row, i) => ({ n: i + 1, row }));

        if (csvSort) {
            const cmp = comparatorFor(detectType(displayed.map(d => d.row[csvSort.col] ?? '')));
            displayed = [...displayed].sort((a, b) => {
                const r = cmp(a.row[csvSort.col] ?? '', b.row[csvSort.col] ?? '');
                return csvSort.dir === 'asc' ? r : -r;
            });
        }

        const arrow = (ci) => csvSort && csvSort.col === ci ? (csvSort.dir === 'asc' ? ' ▲' : ' ▼') : '';

        let html = '<div class="csv-table-wrapper"><table class="csv-table"><thead><tr>';
        html += `<th class="row-num">#</th>`;
        headers.forEach((h, ci) => {
            html += `<th data-col="${ci}" style="cursor:pointer;user-select:none" title="Kliknij, aby sortować">${escapeHtml(h)}${arrow(ci)}</th>`;
        });
        html += '</tr></thead><tbody>';

        displayed.forEach(({ n, row }) => {
            html += `<tr><td class="row-num">${n}</td>`;
            headers.forEach((_, ci) => {
                html += `<td title="${escapeHtml(row[ci] ?? '')}">${escapeHtml(row[ci] ?? '')}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        if (truncated) {
            html += `<p style="color:#888;font-size:0.8rem;margin-top:8px;text-align:center;">Wyświetlono pierwsze ${maxPreview} z ${dataRows.length} wierszy</p>`;
        }

        previewContent.innerHTML = html;
        previewContent.onclick = (e) => {
            const th = e.target.closest('th[data-col]');
            if (!th || !previewContent.contains(th)) return;
            const col = parseInt(th.dataset.col, 10);
            csvSort = (csvSort && csvSort.col === col && csvSort.dir === 'asc')
                ? { col, dir: 'desc' }
                : { col, dir: 'asc' };
            renderCSV();
        };
        updateStats({ rows: dataRows.length, cols: headers.length, chars: currentFileText.length, type: 'CSV' });
    }

    function parseCSVLine(line, sep) {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (ch === sep && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        result.push(cur);
        return result;
    }

    function updateStats(info) {
        uploadStats.style.display = 'block';
        const items = [
            { value: info.rows ?? '—',  label: info.type === 'CSV' ? 'Wierszy danych' : 'Elementów' },
            { value: info.cols ?? '—',  label: info.type === 'CSV' ? 'Kolumn'         : 'Kluczy'    },
            { value: formatBytes(info.chars ?? 0), label: 'Rozmiar tekstu' },
            { value: info.type ?? currentFileType.toUpperCase(), label: 'Format pliku' },
        ];
        statsGrid.innerHTML = items.map(it =>
            `<div class="stat-item"><div class="stat-value">${it.value}</div><div class="stat-label">${it.label}</div></div>`
        ).join('');
    }

    function showError(msg) {
        previewContent.style.display  = 'none';
        previewEmpty.style.display    = 'none';
        previewError.style.display    = 'flex';
        previewErrorMsg.textContent   = msg;
        uploadStats.style.display     = 'none';
    }

    function syntaxHighlightJSON(json) {
        return escapeHtml(json).replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            (match) => {
                if (/^"/.test(match)) {
                    return /:$/.test(match)
                        ? `<span class="json-key">${match}</span>`
                        : `<span class="json-string">${match}</span>`;
                }
                if (/true|false/.test(match)) return `<span class="json-bool">${match}</span>`;
                if (/null/.test(match))       return `<span class="json-null">${match}</span>`;
                return `<span class="json-number">${match}</span>`;
            }
        );
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatBytes(bytes) {
        if (bytes < 1024)       return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
}());

// ============ PANELE WG ROLI (analityk / administrator) ============
(function () {
    const ROLE_TABS = {
        user:     ['upload', 'auth'],
        analityk: ['analyst', 'auth'],
        admin:    ['upload', 'analyst', 'admin', 'auth'],
    };
    const DEFAULT_TAB = { user: 'upload', analityk: 'analyst', admin: 'upload' };
    let currentRole = null;   // null => niezalogowany

    function activateTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tab));
    }

    function tabsForRole(role) {
        return ROLE_TABS[role] || ['upload', 'auth'];   // niezalogowany => Wczytaj dane + Konto
    }
    function homeTab(role) {
        const allowed = tabsForRole(role);
        // niezalogowany / brak domyślnej => pierwsza dozwolona ('upload')
        return (DEFAULT_TAB[role] && allowed.includes(DEFAULT_TAB[role])) ? DEFAULT_TAB[role] : allowed[0];
    }

    // Pokaż tylko zakładki dozwolone dla roli (null => niezalogowany => Wczytaj dane + Konto)
    function applyRole(role) {
        currentRole = role;
        const allowed = tabsForRole(role);
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.style.display = allowed.includes(btn.dataset.tab) ? '' : 'none';
        });
        const activeBtn = document.querySelector('.tab-btn.active');
        const activeTab = activeBtn ? activeBtn.dataset.tab : null;
        if (!activeTab || !allowed.includes(activeTab)) {
            activateTab(homeTab(role));
        }
    }
    window.applyRole = applyRole;

    // Klik w logo => menu główne właściwe dla roli (gość => Wczytaj dane)
    const brand = document.getElementById('brand');
    if (brand) brand.addEventListener('click', () => activateTab(homeTab(currentRole)));

    // --- Pomocnicze ---
    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function renderTable(rows, st) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return '<p style="color:#888;padding:12px;">Brak rekordów.</p>';
        }
        const cols = Object.keys(rows[0]);
        let html = '<div class="csv-table-wrapper"><table class="csv-table"><thead><tr>';
        cols.forEach(c => {
            const arrow = st && st.col === c ? (st.dir === 'asc' ? ' ▲' : ' ▼') : '';
            html += `<th data-col="${esc(c)}" style="cursor:pointer;user-select:none" title="Kliknij, aby sortować">${esc(c)}${arrow}</th>`;
        });
        html += '</tr></thead><tbody>';
        rows.forEach(r => {
            html += '<tr>';
            cols.forEach(c => html += `<td title="${esc(r[c])}">${esc(r[c])}</td>`);
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    // ---------- SORTOWANIE TABEL (klikalne nagłówki, po stronie frontu) ----------
    // Czyste funkcje porównujące (dmyToSortable / isPlainNumber / detectType / comparatorFor)
    // są wspólne i zdefiniowane na górze pliku.
    const sortState = new WeakMap();   // kontener -> { col, dir }

    // Renderuje tabelę z sortowaniem do podanego kontenera i podpina klik w nagłówki.
    function makeSortable(container, rows) {
        const draw = () => {
            const st = sortState.get(container);
            let view = rows;
            if (st && Array.isArray(rows) && rows.length) {
                const cmp = comparatorFor(detectType(rows.map(r => r[st.col])));
                view = [...rows].sort((a, b) => {
                    const r = cmp(a[st.col], b[st.col]);
                    return st.dir === 'asc' ? r : -r;
                });
            }
            container.innerHTML = renderTable(view, st);
        };
        container.onclick = (e) => {
            const th = e.target.closest('th[data-col]');
            if (!th || !container.contains(th)) return;
            const col = th.dataset.col;
            const cur = sortState.get(container);
            const dir = (cur && cur.col === col && cur.dir === 'asc') ? 'desc' : 'asc';
            sortState.set(container, { col, dir });   // klik: brak -> asc -> desc -> asc...
            draw();
        };
        draw();
    }
    async function detail(res, fallback) {
        try {
            const d = await res.json();
            if (typeof d.detail === 'string') return d.detail;
            if (Array.isArray(d.detail)) return d.detail.map(x => x.msg).join(', ');
        } catch (e) { /* brak JSON-a */ }
        return fallback;
    }

    // ---------- PANEL ANALITYKA: GET /records ----------
    const recStatus  = document.getElementById('rec-status');
    const recPurpose = document.getElementById('rec-purpose');
    const recLimit   = document.getElementById('rec-limit');
    const recLoad    = document.getElementById('rec-load');
    const recPrev    = document.getElementById('rec-prev');
    const recNext    = document.getElementById('rec-next');
    const recMsg     = document.getElementById('rec-msg');
    const recTable   = document.getElementById('rec-table');
    const recLoading = document.getElementById('rec-loading');
    const recPageInfo= document.getElementById('rec-page-info');
    let recOffset = 0;

    function recShowMsg(text, type) {
        recMsg.textContent = text;
        recMsg.className = 'records-msg ' + type;
        recMsg.style.display = 'block';
    }

    async function loadRecords() {
        const limit = parseInt(recLimit.value, 10) || 50;
        const params = new URLSearchParams();
        params.set('limit', limit);
        params.set('offset', recOffset);
        if (recStatus.value)  params.set('status', recStatus.value);
        if (recPurpose.value) params.set('purpose', recPurpose.value);

        recMsg.style.display = 'none';        // ukryj ewentualny poprzedni komunikat błędu
        recLoading.style.display = 'flex';    // nakładka nad tabelą — bez przeskoku układu
        recLoad.disabled = true;
        try {
            const res = await Auth.apiFetch('/records?' + params.toString());
            if (!res.ok) throw new Error(await detail(res, `Błąd (${res.status})`));
            const rows = await res.json();
            makeSortable(recTable, rows);
            recPageInfo.textContent = rows.length
                ? `Wiersze ${recOffset + 1}–${recOffset + rows.length}`
                : `Brak rekordów (offset ${recOffset})`;
            recPrev.disabled = recOffset === 0;
            recNext.disabled = rows.length < limit;
        } catch (err) {
            recShowMsg('❌ ' + err.message, 'error');
        } finally {
            recLoading.style.display = 'none';
            recLoad.disabled = false;
        }
    }

    if (recLoad) {
        recLoad.addEventListener('click', () => { recOffset = 0; loadRecords(); });
        recPrev.addEventListener('click', () => { const l = parseInt(recLimit.value, 10) || 50; recOffset = Math.max(0, recOffset - l); loadRecords(); });
        recNext.addEventListener('click', () => { const l = parseInt(recLimit.value, 10) || 50; recOffset += l; loadRecords(); });
    }

    // ---------- PANEL ADMINISTRATORA: operacje RODO ----------
    const admEmail = document.getElementById('adm-email');
    const admMsg   = document.getElementById('adm-msg');
    const admData  = document.getElementById('adm-data');

    function admShowMsg(text, type) {
        admMsg.textContent = text;
        admMsg.className = 'admin-msg ' + type;
        admMsg.style.display = 'block';
    }
    function requireEmail() {
        const e = admEmail.value.trim();
        if (!e) { admShowMsg('⚠️ Podaj e-mail osoby.', 'error'); return null; }
        return e;
    }
    async function admCall(path, opts) {
        admShowMsg('⏳ Przetwarzanie...', 'info');
        try {
            const res = await Auth.apiFetch(path, opts || {});
            if (!res.ok) throw new Error(await detail(res, `Błąd (${res.status})`));
            return res;
        } catch (err) {
            admShowMsg('❌ ' + err.message, 'error');
            return null;
        }
    }

    const admFind = document.getElementById('adm-find');
    if (admFind) admFind.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        const res = await admCall(`/my-data?email=${encodeURIComponent(email)}`);
        if (!res) return;
        const rows = await res.json();
        makeSortable(admData, rows);
        admShowMsg(rows.length ? `✅ Znaleziono ${rows.length} rekord(ów).` : 'ℹ️ Brak danych dla tego e-maila.', rows.length ? 'success' : 'info');
    });

    const admExport = document.getElementById('adm-export');
    if (admExport) admExport.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        const res = await admCall(`/export_data?email=${encodeURIComponent(email)}`);
        if (!res) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `dane_${email}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        admShowMsg('✅ Pobrano plik CSV.', 'success');
    });

    const admFreeze = document.getElementById('adm-freeze');
    if (admFreeze) admFreeze.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        const res = await admCall(`/freeze?email=${encodeURIComponent(email)}`, { method: 'POST' });
        if (res) admShowMsg('✅ Przetwarzanie zamrożone.', 'success');
    });

    const admUnfreeze = document.getElementById('adm-unfreeze');
    if (admUnfreeze) admUnfreeze.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        const res = await admCall(`/un_freeze?email=${encodeURIComponent(email)}`, { method: 'POST' });
        if (res) admShowMsg('✅ Przetwarzanie odblokowane.', 'success');
    });

    const admDelete = document.getElementById('adm-delete');
    if (admDelete) admDelete.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        if (!confirm(`Na pewno usunąć WSZYSTKIE dane dla ${email}? Tej operacji nie można cofnąć.`)) return;
        const res = await admCall(`/records?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
        if (res) { admShowMsg('✅ Dane usunięte.', 'success'); admData.innerHTML = ''; }
    });

    const admEditBtn = document.getElementById('adm-edit-btn');
    if (admEditBtn) admEditBtn.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        const p = new URLSearchParams({ email });
        const map = {
            'adm-edit-first': 'first_name', 'adm-edit-last': 'last_name',
            'adm-edit-pesel': 'PESEL', 'adm-edit-birth': 'birth_date', 'adm-edit-phone': 'phone'
        };
        let any = false;
        Object.entries(map).forEach(([id, key]) => {
            const v = document.getElementById(id).value.trim();
            if (v) { p.set(key, v); any = true; }
        });
        if (!any) { admShowMsg('⚠️ Wypełnij przynajmniej jedno pole do zmiany.', 'error'); return; }
        const res = await admCall(`/change-data?${p.toString()}`);   // backend: GET z query params
        if (res) admShowMsg('✅ Dane zaktualizowane.', 'success');
    });

    const admConsentBtn = document.getElementById('adm-consent-btn');
    if (admConsentBtn) admConsentBtn.addEventListener('click', async () => {
        const email = requireEmail(); if (!email) return;
        const p = new URLSearchParams({
            email,
            purpose: document.getElementById('adm-consent-purpose').value,
            consent: document.getElementById('adm-consent-value').value
        });
        const res = await admCall(`/change_consent?${p.toString()}`, { method: 'POST' });
        if (res) admShowMsg('✅ Zgoda zaktualizowana.', 'success');
    });

    const admPipeBtn = document.getElementById('adm-pipeline-btn');
    const admPipeOut = document.getElementById('adm-pipeline-out');
    if (admPipeBtn) admPipeBtn.addEventListener('click', async () => {
        const res = await admCall('/pipeline/status');
        if (!res) return;
        const data = await res.json();
        admPipeOut.style.display = 'block';
        admPipeOut.textContent = JSON.stringify(data, null, 2);
        admShowMsg('✅ Pobrano status pipeline.', 'success');
    });

    // Start: niezalogowany => tylko zakładka Konto
    applyRole(null);
})();

// ============ SEKCJA: LOGOWANIE / REJESTRACJA ============
(function () {
    const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        ? 'http://localhost:8000'
        : 'https://rodo-1.onrender.com';

    const emailInput   = document.getElementById('auth-email');
    const passInput    = document.getElementById('auth-password');
    const btnLogin     = document.getElementById('btn-login');
    const btnRegister  = document.getElementById('btn-register');
    const btnLogout    = document.getElementById('btn-logout');
    const msgEl        = document.getElementById('auth-message');
    const msgLoggedEl  = document.getElementById('auth-message-logged');

    const formView     = document.getElementById('auth-form');
    const loggedView   = document.getElementById('auth-logged');
    const loggedEmail  = document.getElementById('auth-logged-email');
    const loggedRole   = document.getElementById('auth-logged-role');

    // --- Pomocnicze: komunikaty ---
    function showMsg(el, text, type) {
        el.textContent = text;
        el.className = 'auth-message ' + type;
        el.style.display = 'block';
    }
    function clearMsg(el) {
        el.style.display = 'none';
        el.textContent = '';
    }

    // --- Dekodowanie payloadu JWT (bez weryfikacji — tylko do wyświetlenia) ---
    function decodeJwt(token) {
        try {
            const payload = token.split('.')[1];
            const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decodeURIComponent(escape(json)));
        } catch (e) {
            return null;
        }
    }

    // --- Walidacja danych wejściowych ---
    function readCredentials() {
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !password) {
            showMsg(msgEl, '⚠️ Podaj login i hasło.', 'error');
            return null;
        }
        return { email, password };
    }

    // --- Pobranie szczegółu błędu z odpowiedzi FastAPI ---
    async function errorDetail(response, fallback) {
        try {
            const data = await response.json();
            if (typeof data.detail === 'string') return data.detail;
            if (Array.isArray(data.detail)) return data.detail.map(d => d.msg).join(', ');
        } catch (e) { /* ignorujemy */ }
        return fallback;
    }

    function setButtonsDisabled(state) {
        btnLogin.disabled = state;
        btnRegister.disabled = state;
    }

    // --- REJESTRACJA: POST /register?email=...&password=... (query params) ---
    async function register() {
        const creds = readCredentials();
        if (!creds) return;

        setButtonsDisabled(true);
        showMsg(msgEl, '⏳ Rejestracja...', 'info');
        try {
            const url = `${API}/register?email=${encodeURIComponent(creds.email)}&password=${encodeURIComponent(creds.password)}`;
            const response = await fetch(url, { method: 'POST' });
            if (!response.ok) {
                throw new Error(await errorDetail(response, `Błąd rejestracji (${response.status})`));
            }
            showMsg(msgEl, '✅ Konto utworzone! Możesz się teraz zalogować.', 'success');
        } catch (err) {
            showMsg(msgEl, '❌ ' + err.message, 'error');
        } finally {
            setButtonsDisabled(false);
        }
    }

    // --- LOGOWANIE: POST /login (OAuth2PasswordRequestForm => form-urlencoded) ---
    async function login() {
        const creds = readCredentials();
        if (!creds) return;

        setButtonsDisabled(true);
        showMsg(msgEl, '⏳ Logowanie...', 'info');
        try {
            const body = new URLSearchParams();
            body.append('username', creds.email);   // backend oczekuje pola "username"
            body.append('password', creds.password);

            const response = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body
            });
            if (!response.ok) {
                throw new Error(await errorDetail(response, `Błąd logowania (${response.status})`));
            }
            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
            renderLoggedIn(data.access_token);
        } catch (err) {
            showMsg(msgEl, '❌ ' + err.message, 'error');
        } finally {
            setButtonsDisabled(false);
        }
    }

    // --- WYLOGOWANIE: POST /logout (Bearer token) ---
    async function logout() {
        const token = localStorage.getItem('access_token');
        btnLogout.disabled = true;
        try {
            if (token) {
                await fetch(`${API}/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
            }
        } catch (e) {
            // nawet przy błędzie sieci czyścimy sesję lokalnie
        } finally {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            btnLogout.disabled = false;
            renderLoggedOut();
            showMsg(msgEl, 'ℹ️ Wylogowano.', 'info');
        }
    }

    // --- Przełączanie widoków ---
    function renderLoggedIn(token) {
        const payload = decodeJwt(token);
        loggedEmail.textContent = payload && payload.sub ? payload.sub : (emailInput.value.trim() || '—');
        loggedRole.textContent  = payload && payload.role ? 'Rola: ' + payload.role : '';
        clearMsg(msgEl);
        clearMsg(msgLoggedEl);
        passInput.value = '';
        formView.style.display = 'none';
        loggedView.style.display = 'block';
        if (window.applyRole) window.applyRole(payload && payload.role);
    }

    function renderLoggedOut() {
        formView.style.display = 'block';
        loggedView.style.display = 'none';
        if (window.applyRole) window.applyRole(null);
    }

    // --- Inicjalizacja: ważny access => zalogowany; wygasły => spróbuj odświeżyć refresh tokenem ---
    async function init() {
        const token = localStorage.getItem('access_token');
        if (token && !Auth.isExpired(token)) {
            renderLoggedIn(token);
            return;
        }
        const newToken = await Auth.refreshAccessToken();
        if (newToken) {
            renderLoggedIn(newToken);
        } else {
            Auth.clear();
            renderLoggedOut();
        }
    }

    btnLogin.addEventListener('click', login);
    btnRegister.addEventListener('click', register);
    btnLogout.addEventListener('click', logout);

    // Enter w polu hasła => logowanie
    passInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') login();
    });

    // apiFetch wymusił wylogowanie (refresh padł / sesja wygasła)
    document.addEventListener('auth:logout', () => {
        renderLoggedOut();
        showMsg(msgEl, 'ℹ️ Sesja wygasła — zaloguj się ponownie.', 'info');
    });

    init();
}());

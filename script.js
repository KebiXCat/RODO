// ============ NAWIGACJA ZAKŁADKAMI ============
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });

        // ============ ZAKŁADKI TECHNIK ============
        document.querySelectorAll('.technique-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.technique-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.technique-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tech-' + tab.dataset.technique).classList.add('active');
            });
        });

        // ============ RBAC INTERAKCJA ============
        document.querySelectorAll('.rbac-role').forEach(role => {
            role.addEventListener('click', () => {
                document.querySelectorAll('.rbac-role').forEach(r => r.classList.remove('active'));
                role.classList.add('active');
            });
        });

        // ============ SEKCJA 1: MASKOWANIE ============
        let currentMaskType = 'masking';
        const pseudonymMap = {};
        let pseudonymCounter = 1;

        document.querySelectorAll('.masking-type button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.masking-type button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMaskType = btn.dataset.type;
                
                // Synchronizuj z zakładkami edukacyjnymi
                document.querySelectorAll('.technique-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.technique-content').forEach(c => c.classList.remove('active'));
                
                const techMap = { 'masking': 'masking', 'pseudonym': 'pseudonym', 'anonym': 'anonym' };
                document.querySelector(`.technique-tab[data-technique="${techMap[currentMaskType]}"]`).classList.add('active');
                document.getElementById('tech-' + techMap[currentMaskType]).classList.add('active');
                
                updateMasking();
            });
        });

        function maskString(str, showFirst = 1, showLast = 0) {
            if (!str || str.length <= showFirst + showLast) return str;
            const first = str.substring(0, showFirst);
            const last = showLast > 0 ? str.substring(str.length - showLast) : '';
            const masked = '*'.repeat(str.length - showFirst - showLast);
            return first + masked + last;
        }

        function maskEmail(email) {
            if (!email || !email.includes('@')) return email;
            const [local, domain] = email.split('@');
            return maskString(local, 2, 0) + '@' + maskString(domain, 0, 0).replace(/./g, '*');
        }

        function pseudonymize(value, type) {
            if (!value) return '-';
            const key = type + ':' + value;
            if (!pseudonymMap[key]) {
                pseudonymMap[key] = `${type.toUpperCase()}_${String(pseudonymCounter++).padStart(5, '0')}`;
            }
            return pseudonymMap[key];
        }

        function anonymize(type) {
            const responses = {
                name: '[USUNIĘTO]',
                email: 'user_' + Math.random().toString(36).substr(2, 8) + '@anon.local',
                phone: '[BRAK DANYCH]',
                pesel: '[NIEODWRACALNIE USUNIĘTO]'
            };
            return responses[type] || '[ANON]';
        }

        function applyProtection(value, type) {
            if (!value) return '-';
            
            if (currentMaskType === 'masking') {
                switch(type) {
                    case 'name':
                        return value.split(' ').map(part => maskString(part, 1, 0)).join(' ');
                    case 'email':
                        return maskEmail(value);
                    case 'phone':
                        return maskString(value.replace(/\s/g, ''), 0, 3);
                    case 'pesel':
                        return maskString(value, 0, 4);
                    default:
                        return maskString(value);
                }
            } else if (currentMaskType === 'pseudonym') {
                return pseudonymize(value, type);
            } else {
                return anonymize(type);
            }
        }

        function updateMasking() {
            const name = document.getElementById('mask-name').value;
            const email = document.getElementById('mask-email').value;
            const phone = document.getElementById('mask-phone').value;
            const pesel = document.getElementById('mask-pesel').value;

            document.getElementById('result-name').textContent = applyProtection(name, 'name');
            document.getElementById('result-email').textContent = applyProtection(email, 'email');
            document.getElementById('result-phone').textContent = applyProtection(phone, 'phone');
            document.getElementById('result-pesel').textContent = applyProtection(pesel, 'pesel');
        }

        ['mask-name', 'mask-email', 'mask-phone', 'mask-pesel'].forEach(id => {
            document.getElementById(id).addEventListener('input', updateMasking);
        });

        // ============ SEKCJA 2: ANALIZA FORMULARZA ============
        const fieldAnalysis = {
            email: { 
                status: 'ok', 
                message: '✅ Email — niezbędny do realizacji usługi (podstawa: umowa)',
                hint: 'Email jest OK — to podstawowa dana do komunikacji z użytkownikiem.'
            },
            password: { 
                status: 'ok', 
                message: '✅ Hasło — niezbędne do zabezpieczenia konta',
                hint: 'Hasło jest OK — pamiętaj o hashowaniu (bcrypt/Argon2)!'
            },
            name: { 
                status: 'info', 
                message: 'ℹ️ Imię — opcjonalne, służy personalizacji. Pamiętaj o zgodzie!',
                hint: 'Imię jest opcjonalne. Jeśli służy tylko do "Cześć, Jan!" — rozważ czy jest niezbędne.'
            },
            phone: { 
                status: 'warning', 
                message: '⚠️ Telefon — upewnij się, że masz podstawę prawną (zgoda/uzasadniony interes)',
                hint: 'Telefon to dodatkowa dana kontaktowa. Czy na pewno potrzebujesz SMS-ów? Usuń jeśli nie.'
            },
            birthdate: { 
                status: 'warning', 
                message: '⚠️ Data urodzenia — czy naprawdę potrzebujesz? Rozważ zbieranie tylko wieku lub przedziału',
                hint: 'Zamiast daty urodzenia rozważ: pytanie "Czy masz 18 lat? TAK/NIE" — minimalizacja danych!'
            },
            pesel: { 
                status: 'danger', 
                message: '❌ PESEL — dane nadmiarowe! Numer identyfikacyjny wymaga szczególnej ochrony i uzasadnienia',
                hint: '🚨 PESEL to dana wrażliwa! Usuń to pole — jest nadmiarowe dla większości usług online.'
            }
        };

        let collectedFields = new Set();
        let loggedMessages = new Set(); // Śledzi które wiadomości już pokazano

        document.querySelectorAll('#analyzer .form-field input').forEach(input => {
            // Reaguj na każdą zmianę wartości (wpisywanie I usuwanie)
            input.addEventListener('input', function() {
                const field = this.closest('.form-field').dataset.field;
                const analysis = fieldAnalysis[field];
                const fieldElement = this.closest('.form-field');
                const hasValue = this.value.trim().length > 0;
                
                if (hasValue) {
                    // DODAWANIE danych do pola
                    if (!collectedFields.has(field)) {
                        collectedFields.add(field);
                        addLogEntry(analysis.message, analysis.status);
                        loggedMessages.add(field + '_add');
                        
                        // Specjalne ostrzeżenie dla PESEL
                        if (field === 'pesel' && !loggedMessages.has('pesel_alert')) {
                            addLogEntry('🚨 ALERT: Zbierasz PESEL bez wyraźnej podstawy prawnej!', 'danger');
                            loggedMessages.add('pesel_alert');
                        }
                    }
                    
                    // Dodaj klasę statusu
                    fieldElement.classList.remove('success', 'warning', 'danger', 'fixed');
                    fieldElement.classList.add(analysis.status);
                    
                } else {
                    // USUWANIE danych z pola
                    if (collectedFields.has(field)) {
                        collectedFields.delete(field);
                        
                        // Komunikat o usunięciu danych
                        if (analysis.status === 'danger') {
                            addLogEntry(`✅ <strong>${getFieldName(field)}</strong> usunięte — świetna decyzja! Mniej danych = mniejsze ryzyko.`, 'success');
                        } else if (analysis.status === 'warning') {
                            addLogEntry(`🔄 <strong>${getFieldName(field)}</strong> usunięte — rozważ czy na pewno potrzebujesz tej danej.`, 'info');
                        } else {
                            addLogEntry(`ℹ️ <strong>${getFieldName(field)}</strong> usunięte.`, 'info');
                        }
                        
                        // Zmień wygląd pola na "naprawione"
                        fieldElement.classList.remove('success', 'warning', 'danger');
                        if (analysis.status === 'danger' || analysis.status === 'warning') {
                            fieldElement.classList.add('fixed');
                        }
                    }
                }
                
                updateComplianceMeter();
            });
            
            // Przy focusie pokaż podpowiedź (ale nie dodawaj do collectedFields)
            input.addEventListener('focus', function() {
                const field = this.closest('.form-field').dataset.field;
                const analysis = fieldAnalysis[field];
                
                // Pokaż podpowiedź przy pierwszym kliknięciu w nadmiarowe pole
                if ((analysis.status === 'danger' || analysis.status === 'warning') && !loggedMessages.has(field + '_hint')) {
                    addLogEntry(`💡 <strong>Podpowiedź:</strong> ${analysis.hint || 'Zastanów się czy to pole jest niezbędne.'}`, 'info');
                    loggedMessages.add(field + '_hint');
                }
            });
        });
        
        function getFieldName(field) {
            const names = {
                'email': 'Email',
                'password': 'Hasło',
                'name': 'Imię',
                'phone': 'Telefon',
                'birthdate': 'Data urodzenia',
                'pesel': 'PESEL'
            };
            return names[field] || field;
        }

        function addLogEntry(message, type = 'info') {
            const log = document.getElementById('inspector-log');
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            entry.innerHTML = message;
            
            // Animacja wejścia
            entry.style.opacity = '0';
            entry.style.transform = 'translateX(-20px)';
            log.appendChild(entry);
            
            // Trigger animacji
            setTimeout(() => {
                entry.style.transition = 'all 0.3s ease';
                entry.style.opacity = '1';
                entry.style.transform = 'translateX(0)';
            }, 10);
            
            log.scrollTop = log.scrollHeight;
        }

        function updateComplianceMeter() {
            let score = 100;
            let penalties = [];
            
            collectedFields.forEach(field => {
                const analysis = fieldAnalysis[field];
                if (analysis.status === 'warning') {
                    score -= 15;
                    penalties.push(`${getFieldName(field)}: -15%`);
                }
                if (analysis.status === 'danger') {
                    score -= 30;
                    penalties.push(`${getFieldName(field)}: -30%`);
                }
            });
            score = Math.max(0, score);
            
            const percentEl = document.getElementById('compliance-percent');
            const barEl = document.getElementById('compliance-bar');
            
            // Animowana zmiana wartości
            percentEl.textContent = score + '%';
            barEl.style.width = score + '%';
            
            // Zmiana koloru w zależności od wyniku
            if (score >= 80) {
                barEl.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';
                percentEl.style.color = '#4caf50';
            } else if (score >= 50) {
                barEl.style.background = 'linear-gradient(90deg, #ff9800, #ffc107)';
                percentEl.style.color = '#ff9800';
            } else {
                barEl.style.background = 'linear-gradient(90deg, #f44336, #ff5722)';
                percentEl.style.color = '#f44336';
            }
        }

        // ============ SEKCJA 3: PRZEPŁYW DANYCH ============
        const flowDetails = {
            input: {
                title: '📝 Zbieranie danych (Formularz)',
                items: [
                    '✅ <strong>Zasada minimalizacji (Art. 5 ust. 1 lit. c)</strong> — zbieramy tylko niezbędne dane do określonego celu',
                    '✅ <strong>Podstawa prawna (Art. 6)</strong> — zgoda, umowa, obowiązek prawny, interes publiczny lub prawnie uzasadniony interes',
                    '✅ <strong>Obowiązek informacyjny (Art. 13-14)</strong> — użytkownik musi wiedzieć: kto, co, dlaczego, jak długo',
                    '✅ <strong>Transmisja HTTPS</strong> — TLS 1.3 szyfruje dane "w locie" między przeglądarką a serwerem',
                    '⚠️ <strong>Walidacja server-side</strong> — nigdy nie ufaj danym od klienta (OWASP Top 10: A03 Injection)'
                ],
                links: [
                    { title: '📖 Art. 5 RODO — Zasady przetwarzania', url: 'https://gdpr-info.eu/art-5-gdpr/', desc: 'Oficjalny tekst + komentarz' },
                    { title: '📖 Art. 6 RODO — Podstawy prawne', url: 'https://gdpr-info.eu/art-6-gdpr/', desc: '6 legalnych podstaw przetwarzania' },
                    { title: '📖 Art. 13 RODO — Obowiązek informacyjny', url: 'https://gdpr-info.eu/art-13-gdpr/', desc: 'Co musisz powiedzieć użytkownikowi' },
                    { title: '🔒 OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/', desc: '10 najczęstszych zagrożeń webowych' },
                    { title: '🔐 Mozilla TLS Guidelines', url: 'https://wiki.mozilla.org/Security/Server_Side_TLS', desc: 'Jak poprawnie skonfigurować HTTPS' },
                    { title: '🇵🇱 UODO — Poradniki', url: 'https://uodo.gov.pl/pl/138', desc: 'Oficjalne poradniki polskiego organu nadzorczego' }
                ]
            },
            encrypt: {
                title: '🔐 Szyfrowanie i ochrona',
                items: [
                    '🔒 <strong>Szyfrowanie w spoczynku (at rest)</strong> — AES-256-GCM dla danych w bazie i na dysku',
                    '🔒 <strong>Szyfrowanie w tranzycie (in transit)</strong> — TLS 1.3 eliminuje słabe szyfry (RC4, 3DES)',
                    '🔑 <strong>Zarządzanie kluczami (KMS)</strong> — HSM, AWS KMS, Azure Key Vault — klucze nigdy w kodzie!',
                    '🔐 <strong>Haszowanie haseł</strong> — Argon2id (zwycięzca PHC) > bcrypt > PBKDF2. Nigdy MD5/SHA1!',
                    '📋 <strong>Art. 32 RODO</strong> — "odpowiedni poziom bezpieczeństwa" = ocena ryzyka + adekwatne środki'
                ],
                links: [
                    { title: '📖 Art. 32 RODO — Bezpieczeństwo', url: 'https://gdpr-info.eu/art-32-gdpr/', desc: 'Obowiązek odpowiednich środków technicznych' },
                    { title: '🔐 NIST Cryptographic Standards', url: 'https://csrc.nist.gov/publications/detail/sp/800-175b/rev-1/final', desc: 'Oficjalne standardy kryptograficzne USA' },
                    { title: '🏆 Password Hashing Competition', url: 'https://www.password-hashing.net/', desc: 'Dlaczego Argon2 wygrał konkurs PHC' },
                    { title: '🔑 OWASP Password Storage', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html', desc: 'Jak bezpiecznie przechowywać hasła' },
                    { title: '☁️ AWS KMS Best Practices', url: 'https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html', desc: 'Zarządzanie kluczami w chmurze' },
                    { title: '🔒 SSL Labs Test', url: 'https://www.ssllabs.com/ssltest/', desc: 'Sprawdź konfigurację TLS swojego serwera' }
                ]
            },
            storage: {
                title: '🗄️ Przechowywanie danych',
                items: [
                    '📍 <strong>Lokalizacja danych</strong> — EOG bez ograniczeń; poza EOG wymaga SCC, BCR lub decyzji adekwatności',
                    '⏱️ <strong>Retencja (Art. 5 ust. 1 lit. e)</strong> — dane usuwane gdy cel przetwarzania ustał',
                    '💾 <strong>Kopie zapasowe</strong> — szyfrowane, z własną polityką retencji, testowane regularnie',
                    '🔍 <strong>Audyt i logi</strong> — SIEM, immutable logs, kto/kiedy/do czego miał dostęp',
                    '📊 <strong>Rejestr czynności (Art. 30)</strong> — obowiązkowy dla firm 250+ lub przy przetwarzaniu wrażliwych danych'
                ],
                links: [
                    { title: '📖 Art. 5 ust. 1 lit. e RODO — Retencja', url: 'https://gdpr-info.eu/art-5-gdpr/', desc: 'Zasada ograniczenia przechowywania' },
                    { title: '📖 Art. 30 RODO — Rejestr czynności', url: 'https://gdpr-info.eu/art-30-gdpr/', desc: 'Co musi zawierać rejestr' },
                    { title: '🌍 Transfery poza EOG', url: 'https://ec.europa.eu/info/law/law-topic/data-protection/international-dimension-data-protection_en', desc: 'Oficjalne wytyczne Komisji Europejskiej' },
                    { title: '📋 Standardowe klauzule (SCC)', url: 'https://ec.europa.eu/info/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en', desc: 'Wzory umów dla transferów danych' },
                    { title: '🇵🇱 UODO — Rejestr czynności', url: 'https://uodo.gov.pl/pl/123/214', desc: 'Poradnik UODO dot. rejestru' },
                    { title: '💾 NIST Backup Guidelines', url: 'https://csrc.nist.gov/publications/detail/sp/800-34/rev-1/final', desc: 'Contingency Planning Guide' }
                ]
            },
            access: {
                title: '👥 Kontrola dostępu',
                items: [
                    '👤 <strong>Zasada najmniejszych uprawnień (PoLP)</strong> — dostęp tylko do tego co niezbędne do pracy',
                    '🔐 <strong>MFA (Multi-Factor Auth)</strong> — obowiązkowe dla adminów i dostępu do danych wrażliwych',
                    '📝 <strong>Audit trail</strong> — immutable logi: kto, kiedy, skąd, do jakich danych, jaka operacja',
                    '📋 <strong>Umowy powierzenia (Art. 28)</strong> — procesor = firma przetwarzająca w Twoim imieniu',
                    '🚫 <strong>Ocena dostawców</strong> — due diligence przed powierzeniem danych podmiotowi trzeciemu'
                ],
                links: [
                    { title: '📖 Art. 28 RODO — Procesor', url: 'https://gdpr-info.eu/art-28-gdpr/', desc: 'Wymagania dla umów powierzenia' },
                    { title: '📖 Art. 29 RODO — Upoważnienia', url: 'https://gdpr-info.eu/art-29-gdpr/', desc: 'Kto może przetwarzać dane' },
                    { title: '🔐 NIST Access Control', url: 'https://csrc.nist.gov/publications/detail/sp/800-162/final', desc: 'Guide to Attribute Based Access Control' },
                    { title: '🔑 OWASP Access Control', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Access_Control_Cheat_Sheet.html', desc: 'Best practices kontroli dostępu' },
                    { title: '🇵🇱 UODO — Umowy powierzenia', url: 'https://uodo.gov.pl/pl/138/427', desc: 'Poradnik UODO' },
                    { title: '📊 CIS Controls', url: 'https://www.cisecurity.org/controls', desc: '18 krytycznych kontroli bezpieczeństwa' }
                ]
            }
        };

        document.querySelectorAll('.flow-node').forEach(node => {
            node.addEventListener('click', function() {
                document.querySelectorAll('.flow-node').forEach(n => n.classList.remove('active'));
                this.classList.add('active');
                
                const details = flowDetails[this.dataset.node];
                const linksHtml = details.links ? `
                    <div class="flow-links">
                        <h4>📚 Dowiedz się więcej:</h4>
                        <div class="links-grid">
                            ${details.links.map(link => `
                                <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="source-link">
                                    <div class="link-title">${link.title}</div>
                                    <div class="link-desc">${link.desc}</div>
                                    <div class="link-url">${link.url.replace('https://', '').split('/')[0]}</div>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                ` : '';
                
                const html = `
                    <h3>${details.title}</h3>
                    <ul class="flow-items">
                        ${details.items.map(item => `<li>${item}</li>`).join('')}
                    </ul>
                    ${linksHtml}
                `;
                document.getElementById('flow-details').innerHTML = html;
            });
        });

        // ============ SEKCJA 4: PRAWA UŻYTKOWNIKA ============
        const userData = {
            name: "Jan Kowalski",
            email: "jan.kowalski@email.com",
            phone: "+48 500 123 456",
            created: "2024-03-15",
            lastLogin: "2025-02-05",
            orders: 12,
            consents: {
                marketing: true,
                profiling: false,
                newsletter: true
            }
        };

        const rightsDemo = {
            access: () => {
                return `
                    <h3>📄 Prawo dostępu do danych (Art. 15)</h3>
                    <p style="margin-bottom: 15px; color: #888;">Twoje dane przechowywane w naszym systemie:</p>
                    <div class="data-export">${JSON.stringify(userData, null, 2)}</div>
                    <p style="margin-top: 15px; color: #888; font-size: 0.9rem;">
                        ✅ Administrator ma 30 dni na realizację żądania<br>
                        ✅ Pierwsza kopia bezpłatna, kolejne mogą być płatne
                    </p>
                `;
            },
            portability: () => {
                const exportData = JSON.stringify(userData, null, 2);
                return `
                    <h3>📦 Prawo do przenoszenia (Art. 20)</h3>
                    <p style="margin-bottom: 15px; color: #888;">Eksport danych w formacie możliwym do odczytu maszynowego:</p>
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <button data-action="download-json" style="padding: 10px 20px; background: #4a9eff; border: none; color: #000; border-radius: 5px; cursor: pointer;">📥 Pobierz JSON</button>
                        <button data-action="download-csv" style="padding: 10px 20px; background: #4caf50; border: none; color: #000; border-radius: 5px; cursor: pointer;">📥 Pobierz CSV</button>
                    </div>
                    <div class="data-export">${exportData}</div>
                `;
            },
            rectify: () => {
                return `
                    <h3>✏️ Prawo do sprostowania (Art. 16)</h3>
                    <p style="margin-bottom: 15px; color: #888;">Zaktualizuj swoje dane:</p>
                    <div class="form-field" style="margin-bottom: 15px;">
                        <label style="color: #888; margin-bottom: 5px; display: block;">Imię i nazwisko</label>
                        <input type="text" value="${userData.name}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 2px solid #4a9eff; color: #fff; border-radius: 5px;">
                    </div>
                    <div class="form-field" style="margin-bottom: 15px;">
                        <label style="color: #888; margin-bottom: 5px; display: block;">Telefon</label>
                        <input type="tel" value="${userData.phone}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 2px solid #4a9eff; color: #fff; border-radius: 5px;">
                    </div>
                    <button style="padding: 10px 30px; background: #4caf50; border: none; color: #000; border-radius: 5px; cursor: pointer;">💾 Zapisz zmiany</button>
                    <p style="margin-top: 15px; color: #888; font-size: 0.9rem;">
                        ✅ Zmiany zostaną wprowadzone natychmiast<br>
                        ✅ Powiadomienia o zmianie wysłane do administratora
                    </p>
                `;
            },
            consent: () => {
                return `
                    <h3>🎚️ Zarządzanie zgodami (Art. 7)</h3>
                    <p style="margin-bottom: 15px; color: #888;">Twoje aktualne zgody — możesz je zmienić w dowolnym momencie:</p>
                    <div class="consent-item">
                        <div class="consent-label">
                            <span>📧</span>
                            <span>Komunikacja marketingowa</span>
                        </div>
                        <div class="toggle ${userData.consents.marketing ? 'active' : ''}" data-action="toggle-consent"></div>
                    </div>
                    <div class="consent-item">
                        <div class="consent-label">
                            <span>📊</span>
                            <span>Profilowanie i personalizacja</span>
                        </div>
                        <div class="toggle ${userData.consents.profiling ? 'active' : ''}" data-action="toggle-consent"></div>
                    </div>
                    <div class="consent-item">
                        <div class="consent-label">
                            <span>📰</span>
                            <span>Newsletter</span>
                        </div>
                        <div class="toggle ${userData.consents.newsletter ? 'active' : ''}" data-action="toggle-consent"></div>
                    </div>
                    <p style="margin-top: 15px; color: #888; font-size: 0.9rem;">
                        ✅ Wycofanie zgody jest tak samo łatwe jak jej wyrażenie<br>
                        ✅ Wycofanie nie wpływa na zgodność przetwarzania przed wycofaniem
                    </p>
                `;
            },
            delete: () => {
                return `
                    <h3>🗑️ Prawo do usunięcia — "prawo do bycia zapomnianym" (Art. 17)</h3>
                    <div class="delete-animation" id="delete-demo">
                        <div class="icon">⚠️</div>
                        <p>Czy na pewno chcesz usunąć wszystkie swoje dane?</p>
                        <p style="color: #888; font-size: 0.9rem; margin-top: 10px;">Ta operacja jest nieodwracalna.</p>
                        <button data-action="simulate-delete" style="margin-top: 20px; padding: 15px 30px; background: #ff6b6b; border: none; color: #fff; border-radius: 5px; cursor: pointer; font-size: 1rem;">🗑️ Usuń moje dane</button>
                    </div>
                    <p style="margin-top: 15px; color: #888; font-size: 0.9rem;">
                        ⚠️ Nie dotyczy danych niezbędnych do realizacji obowiązków prawnych<br>
                        ⚠️ Administrator może odmówić w określonych przypadkach (Art. 17 ust. 3)
                    </p>
                `;
            },
            object: () => {
                return `
                    <h3>✋ Prawo do sprzeciwu (Art. 21)</h3>
                    <p style="margin-bottom: 15px; color: #888;">Możesz sprzeciwić się przetwarzaniu w określonych celach:</p>
                    <div class="consent-item">
                        <div class="consent-label">
                            <span>📢</span>
                            <span>Marketing bezpośredni</span>
                        </div>
                        <button style="padding: 8px 16px; background: #ff6b6b; border: none; color: #fff; border-radius: 5px; cursor: pointer;">Sprzeciw</button>
                    </div>
                    <div class="consent-item">
                        <div class="consent-label">
                            <span>🎯</span>
                            <span>Profilowanie do celów marketingowych</span>
                        </div>
                        <button style="padding: 8px 16px; background: #ff6b6b; border: none; color: #fff; border-radius: 5px; cursor: pointer;">Sprzeciw</button>
                    </div>
                    <div style="background: rgba(74, 158, 255, 0.1); padding: 15px; border-radius: 10px; margin-top: 20px;">
                        <strong style="color: #4a9eff;">💡 Różnica od wycofania zgody:</strong>
                        <p style="margin-top: 5px; font-size: 0.9rem;">Sprzeciw dotyczy przetwarzania na podstawie uzasadnionego interesu administratora — nie zgody. Przy marketingu bezpośrednim sprzeciw jest BEZWZGLĘDNY.</p>
                    </div>
                `;
            }
        };

        document.querySelectorAll('.right-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const right = this.dataset.right;
                document.getElementById('rights-demo').innerHTML = rightsDemo[right]();
            });
        });

        function simulateDelete() {
            const demo = document.getElementById('delete-demo');
            demo.innerHTML = `
                <div class="icon">🔄</div>
                <p>Usuwanie danych...</p>
                <div class="delete-progress">
                    <div class="delete-progress-bar" id="delete-bar"></div>
                </div>
                <p id="delete-status" style="color: #888; font-size: 0.9rem;">Usuwanie profilu...</p>
            `;
            
            const bar = document.getElementById('delete-bar');
            const status = document.getElementById('delete-status');
            const steps = [
                { progress: 20, text: 'Usuwanie profilu...' },
                { progress: 40, text: 'Usuwanie historii zamówień...' },
                { progress: 60, text: 'Usuwanie zgód...' },
                { progress: 80, text: 'Usuwanie z kopii zapasowych...' },
                { progress: 100, text: 'Zakończono!' }
            ];
            
            let i = 0;
            const interval = setInterval(() => {
                if (i < steps.length) {
                    bar.style.width = steps[i].progress + '%';
                    status.textContent = steps[i].text;
                    i++;
                } else {
                    clearInterval(interval);
                    demo.innerHTML = `
                        <div class="icon">✅</div>
                        <p style="color: #4caf50;">Twoje dane zostały usunięte</p>
                        <p style="color: #888; font-size: 0.9rem; margin-top: 10px;">
                            Potwierdzenie wysłane na email.<br>
                            Niektóre dane mogą być zachowane przez okres wymagany prawem.
                        </p>
                    `;
                }
            }, 800);
        }

        function downloadData(format) {
            alert(`📥 Pobieranie danych w formacie ${format.toUpperCase()}...\n\n(To jest demonstracja — w prawdziwej aplikacji rozpocząłby się download pliku)`);
        }
// ============ EVENT DELEGATION (zastąpienie inline onclick) ============
document.addEventListener('click', function(e) {
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const act = action.getAttribute('data-action');
    if (act === 'download-json') downloadData('json');
    if (act === 'download-csv')  downloadData('csv');
    if (act === 'toggle-consent') action.classList.toggle('active');
    if (act === 'simulate-delete') simulateDelete();
});

// PASTE YOUR VERCEL API URL HERE
const VERCEL_API_URL = "https://b3-checker-eight.vercel.app/";

const checkBtn = document.getElementById('check-btn');
const stopCheckBtn = document.getElementById('stop-check-btn');
const numbersTextarea = document.getElementById('numbers');
const resultOutputTextarea = document.getElementById('result-output');
const liveNumbersTextarea = document.getElementById('ali-numbers');
const deadNumbersTextarea = document.getElementById('muhammad-numbers');

let stopChecking = false;
let liveCount = 0;
let deadCount = 0;

checkBtn.addEventListener('click', startChecking);
stopCheckBtn.addEventListener('click', () => {
    stopChecking = true;
    stopCheckBtn.disabled = true;
    checkBtn.disabled = false;
    appendToStatusOutput("⏹️ Checking stopped by user.\n");
});

function toggleButtons() {
    checkBtn.disabled = true;
    stopCheckBtn.disabled = false;
}

async function startChecking() {
    const baseUrl = VERCEL_API_URL.trim().replace(/\/$/, "");
    if (!baseUrl) {
        Swal.fire('Error', 'Please set VERCEL_API_URL in script.js first.', 'error');
        return;
    }

    stopChecking = false;
    liveCount = 0;
    deadCount = 0;

    resultOutputTextarea.value = "";
    liveNumbersTextarea.value = "";
    deadNumbersTextarea.value = "";
    updateSummaryCounts(0, 0);

    const input = numbersTextarea.value.trim();
    const cards = input.split("\n").filter(line => line.trim() !== "");

    if (cards.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'No cards provided!',
            text: 'Please enter credit card numbers to check.',
            toast: true,
            position: 'top-end',
            timer: 3000,
            showConfirmButton: false
        });
        return;
    }

    checkBtn.disabled = true;
    stopCheckBtn.disabled = false;

    appendToStatusOutput(`⏳ Starting check of ${cards.length} cards...\n`);

    for (let i = 0; i < cards.length; i++) {
        if (stopChecking) break;

        const card = cards[i].trim();
        appendToStatusOutput(`➡️ Checking card ${i + 1} of ${cards.length}: ${card}\n`);

        try {
            const customCookiesRaw = localStorage.getItem('custom_cookies');
            let response;

            const hasCustomCookies = customCookiesRaw && (function () {
                try {
                    const parsed = JSON.parse(customCookiesRaw);
                    return Array.isArray(parsed) && parsed.length > 0 && Object.keys(parsed[0]).length > 0;
                } catch (e) { return false; }
            })();

            if (hasCustomCookies) {
                try {
                    const customCookies = JSON.parse(customCookiesRaw);
                    const currentSet = customCookies[i % customCookies.length];

                    response = await fetch(`${baseUrl}/check`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            card: card,
                            cookies: currentSet
                        })
                    });
                } catch (e) {
                    console.error("Cookie parse/fetch error", e);
                    appendToStatusOutput(`❌ Cookie Error: ${e.message}\n`);
                    continue;
                }
            } else {
                response = await fetch(`${baseUrl}/check?card=${encodeURIComponent(card)}`, {
                    method: 'GET'
                });
            }

            if (!response.ok) throw new Error(`API responded with status ${response.status}`);

            const data = await response.json();

            let status = 'Unknown';
            if (data.status === 'APPROVED') status = 'Live';
            else if (data.status === 'DECLINED') status = 'Dead';

            if (status === 'Live') {
                liveCount++;
                liveNumbersTextarea.value += card + "\n";
                appendToStatusOutput(`Result: 🟢 Live [${data.cookie_source}] - ${data.response}\n`);
            } else if (status === 'Dead') {
                deadCount++;
                deadNumbersTextarea.value += card + "\n";
                appendToStatusOutput(`Result: 🔴 Dead [${data.cookie_source}] - ${data.response}\n`);
            } else {
                appendToStatusOutput(`Result: ⚪ Unknown [${data.cookie_source}] - ${data.response}\n`);
            }

            updateSummaryCounts(liveCount, deadCount);
        } catch (error) {
            appendToStatusOutput(`❌ Error checking card ${card}: ${error.message}\n`);
        }

        // Delay 3 seconds between checks, skip after the last one
        if (i !== cards.length - 1) {
            await countdownTimer(3);
        }
    }

    if (!stopChecking) {
        appendToStatusOutput("\n✅ Checking Finished!\n");
        checkBtn.disabled = false;
        stopCheckBtn.disabled = true;

        Swal.fire({
            icon: 'success',
            title: 'All cards checked!',
            toast: true,
            position: 'top-end',
            timer: 3000,
            showConfirmButton: false
        });
    }
}

function countdownTimer(seconds) {
    return new Promise((resolve) => {
        let timeLeft = seconds;

        const previousStatus = resultOutputTextarea.value;

        const interval = setInterval(() => {
            resultOutputTextarea.value = `${previousStatus}⏳ Waiting: ${timeLeft} second(s) left...\n`;
            resultOutputTextarea.scrollTop = resultOutputTextarea.scrollHeight;
            timeLeft--;

            if (timeLeft < 0) {
                clearInterval(interval);
                resultOutputTextarea.value = previousStatus;
                resolve();
            }
        }, 1000);
    });
}

function appendToStatusOutput(text) {
    resultOutputTextarea.value += text;
    resultOutputTextarea.scrollTop = resultOutputTextarea.scrollHeight;
}

function updateSummaryCounts(live, dead) {
    document.getElementById('ali-count').textContent = live;
    document.getElementById('muhammad-count').textContent = dead;
}

function copyToClipboard(id) {
    const textarea = document.getElementById(id);
    if (!textarea || !textarea.value.trim()) {
        Swal.fire({
            icon: 'warning',
            title: 'Nothing to copy',
            background: '#232a41', // using generic dark bg just in case, or default since we changed colors
            color: '#fff',
            toast: true,
            position: 'top-end',
            timer: 1500,
            showConfirmButton: false
        });
        return;
    }

    textarea.select();
    document.execCommand('copy');

    Swal.fire({
        icon: 'success',
        title: 'Copied!',
        toast: true,
        position: 'top-end',
        timer: 1500,
        showConfirmButton: false
    });
}

function toggleMenu() {
    const menu = document.getElementById('dropdown-menu');
    menu.classList.toggle('show');
}

document.addEventListener('click', function (event) {
    const toggle = document.querySelector('.menu-toggle');
    const menu = document.getElementById('dropdown-menu');

    if (!menu.contains(event.target) && !toggle.contains(event.target)) {
        menu.classList.remove('show');
    }
});

function showCookieImport() {
    let cookiesArray = [];
    try {
        cookiesArray = JSON.parse(localStorage.getItem('custom_cookies')) || [];
    } catch (e) { cookiesArray = []; }

    while (cookiesArray.length < 4) cookiesArray.push({});

    function renderInputs(data) {
        let html = `
            <div style="background: #e3f2fd; border: 1px solid #bbdefb; border-radius: 8px; padding: 12px; margin-bottom: 20px; text-align: left; font-size: 13px; color: #1976d2; line-height: 1.5;">
                <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
                <strong>Instructions:</strong><br>
                1. Visit <a href="https://www.calipercovers.com/" target="_blank" style="color: #0d47a1; font-weight: bold; text-decoration: underline;">https://www.calipercovers.com/</a><br>
                2. Use a browser extension (like EditThisCookie) to copy your cookies in <strong>JSON array format</strong>.<br>
                3. Paste the JSON data into the account boxes below.
            </div>
        `;
        html += '<div id="cookie-inputs-container" style="max-height: 400px; overflow-y: auto; padding: 10px;">';
        data.forEach((cookie, index) => {
            const value = (cookie && Object.keys(cookie).length) ? JSON.stringify(cookie, null, 2) : '';
            html += `
                <div class="cookie-input-row" style="display: flex; align-items: flex-start; margin-bottom: 15px; gap: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <span style="color: #333; font-weight: bold; min-width: 80px; margin-top: 10px;">Account ${index + 1}:</span>
                    <textarea class="swal2-textarea custom-cookie-box" style="margin: 0; flex: 1; height: 100px; font-size: 11px; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-family: monospace; line-height: 1.4;" 
                        placeholder='Paste JSON array here...'>${value.replace(/'/g, "&apos;")}</textarea>
                    <button onclick="removeAccountRow(${index})" style="background: #f44336; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; margin-top: 10px;" title="Remove">
                        <i class="fas fa-minus"></i>
                    </button>
                </div>
            `;
        });
        html += '</div>';
        html += `
            <div style="margin-top: 15px; display: flex; justify-content: center; gap: 12px;">
                <button onclick="addAccountRow()" style="background: #4caf50; color: white; border: none; padding: 10px 18px; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    <i class="fas fa-plus"></i> Add Account
                </button>
                <button onclick="clearCookies()" style="background: #ff9800; color: white; border: none; padding: 10px 18px; border-radius: 5px; font-weight: bold; cursor: pointer;">
                    Clear All
                </button>
            </div>
        `;
        return html;
    }

    Swal.fire({
        title: 'Import Custom Cookies',
        html: renderInputs(cookiesArray),
        width: '750px',
        showCancelButton: true,
        confirmButtonText: 'Save All Accounts',
        background: '#ffffff',
        didOpen: () => {
            window.addAccountRow = () => {
                const rows = document.querySelectorAll('.custom-cookie-box');
                const currentData = Array.from(rows).map(r => {
                    try { return r.value.trim() ? JSON.parse(r.value.trim()) : {}; } catch (e) { return {}; }
                });
                currentData.push({});

                const container = document.getElementById('cookie-inputs-container').parentElement;
                container.innerHTML = renderInputs(currentData);
            };

            window.removeAccountRow = (index) => {
                const rows = document.querySelectorAll('.custom-cookie-box');
                if (rows.length <= 4) {
                    Swal.showValidationMessage('Minimum 4 accounts are required!');
                    return;
                }
                const currentData = Array.from(rows).map(r => {
                    try { return r.value.trim() ? JSON.parse(r.value.trim()) : {}; } catch (e) { return {}; }
                });
                currentData.splice(index, 1);

                const container = document.getElementById('cookie-inputs-container').parentElement;
                container.innerHTML = renderInputs(currentData);
            };
        },
        preConfirm: () => {
            const rows = document.querySelectorAll('.custom-cookie-box');
            const results = [];
            let hasError = false;

            rows.forEach((row, idx) => {
                const val = row.value.trim();
                if (!val) {
                    Swal.showValidationMessage(`Account ${idx + 1} is empty!`);
                    hasError = true;
                    return;
                }
                try {
                    results.push(JSON.parse(val));
                } catch (e) {
                    Swal.showValidationMessage(`Invalid JSON in Account ${idx + 1}!`);
                    hasError = true;
                }
            });

            if (hasError) return false;
            return results;
        }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.setItem('custom_cookies', JSON.stringify(result.value));
            updateCookieBadge();
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: 'All cookies saved and active!',
                background: '#ffffff',
                color: '#000'
            });
        }
    });
}

function clearCookies() {
    localStorage.removeItem('custom_cookies');
    localStorage.removeItem('custom_cookies_raw');
    updateCookieBadge();
    Swal.close();
    Swal.fire({
        icon: 'info',
        title: 'Cleared',
        text: 'Custom cookies removed. Using system default.',
        background: '#ffffff',
        color: '#000'
    });
}

function updateCookieBadge() {
    const badge = document.getElementById('custom-cookie-badge');
    if (localStorage.getItem('custom_cookies')) {
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// Initialize badge on load
updateCookieBadge();

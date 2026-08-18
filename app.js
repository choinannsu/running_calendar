// Marathon Mileage Planner App State
class MarathonApp {
  constructor() {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth() + 1; // 1-indexed (1-12)
    this.targetMileage = 200; // default target km
    this.mileageData = {}; // Format: { "YYYY-MM-DD": { distance: 10, type: "tempo", note: "..." } }
    this.garminData = {};  // Garmin synced data format: { "YYYY-MM-DD": { distance: 10.5, pace: "5:10", note: "..." } }
    this.weatherData = {}; // Seoul Weather format: { "YYYY-MM-DD": { icon: "☀️", desc: "맑음", tempMin: 24, tempMax: 31 } }
    this.garminLastUpdated = null;

    // Master Passcode SHA-256 Hash
    this.MASTER_HASH = "fdcd529553d550ca944451a8bec062e3d3abbc9c455d478026f0cc6d44ffd1bd";

    this.init();
  }

  async init() {
    this.initPasscodeAuth();
    this.loadStateFromStorage();
    this.loadWeatherCache();
    this.bindEvents();
    await this.fetchGarminData();
    await this.fetchSeoulWeather(this.currentYear, this.currentMonth);
    this.render();
    
    // Initialize Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // SHA-256 Helper Function (supports both HTTPS crypto.subtle & HTTP non-secure fallback)
  async sha256(message) {
    if (window.crypto && window.crypto.subtle) {
      try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        console.warn('crypto.subtle failed, falling back to pure JS SHA-256:', e);
      }
    }
    return this.fallbackSha256(message);
  }

  // Pure JavaScript SHA-256 Fallback for HTTP IP addresses
  fallbackSha256(ascii) {
    function rrr(v, n) { return (v >>> n) | (v << (32 - n)); }
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    const utf8 = unescape(encodeURIComponent(ascii));
    const len = utf8.length;
    const blocks = [];

    for (let i = 0; i < len; i++) {
      blocks[i >> 2] |= utf8.charCodeAt(i) << (24 - (i % 4) * 8);
    }

    blocks[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    blocks[(((len + 8) >> 6) << 4) + 15] = len * 8;

    for (let i = 0; i < blocks.length; i += 16) {
      const w = new Array(64);
      for (let t = 0; t < 16; t++) w[t] = blocks[i + t] || 0;
      for (let t = 16; t < 64; t++) {
        const s0 = rrr(w[t - 15], 7) ^ rrr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rrr(w[t - 2], 17) ^ rrr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }

      let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hVal = h[7];

      for (let t = 0; t < 64; t++) {
        const S1 = rrr(e, 6) ^ rrr(e, 11) ^ rrr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (hVal + S1 + ch + k[t] + w[t]) | 0;
        const S0 = rrr(a, 2) ^ rrr(a, 13) ^ rrr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;

        hVal = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }

      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hVal) | 0;
    }

    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  // Passcode Lock Security Engine (Master Lock)
  initPasscodeAuth() {
    const isUnlockedInSession = sessionStorage.getItem('app_unlocked') === 'true';

    const overlay = document.getElementById('passcode-lock-overlay');
    const appContainer = document.getElementById('main-app-content');
    const lockTitle = document.getElementById('lock-title');
    const lockDesc = document.getElementById('lock-desc');
    const passInput = document.getElementById('passcode-input');

    if (!isUnlockedInSession) {
      lockTitle.textContent = "🔒 보안 잠금";
      lockDesc.textContent = "마라톤 캘린더에 접근하려면 비밀번호를 입력해 주세요.";
      overlay.classList.remove('hidden');
      appContainer.classList.add('app-hidden');
    } else {
      overlay.classList.add('hidden');
      appContainer.classList.remove('app-hidden');
    }

    // Passcode Form Submit Handler
    const lockForm = document.getElementById('lock-form');
    lockForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const entered = passInput.value.trim();
      if (!entered) return;

      const enteredHash = await this.sha256(entered);

      if (enteredHash === this.MASTER_HASH) {
        sessionStorage.setItem('app_unlocked', 'true');
        overlay.classList.add('hidden');
        appContainer.classList.remove('app-hidden');
        document.getElementById('lock-error-msg').classList.add('hidden');
        passInput.value = '';
      } else {
        document.getElementById('lock-error-msg').classList.remove('hidden');
        const card = document.querySelector('.lock-card');
        card.classList.remove('shake-anim');
        void card.offsetWidth; // trigger reflow
        card.classList.add('shake-anim');
      }
    });
  }

  // Open-Meteo Weather Code Mapper
  getWeatherInfo(code) {
    const map = {
      0: { icon: '☀️', desc: '맑음' },
      1: { icon: '🌤️', desc: '대체로 맑음' },
      2: { icon: '⛅', desc: '구름 조금' },
      3: { icon: '☁️', desc: '흐림' },
      45: { icon: '🌫️', desc: '안개' },
      48: { icon: '🌫️', desc: '짙은 안개' },
      51: { icon: '🌧️', desc: '이슬비' },
      53: { icon: '🌧️', desc: '이슬비' },
      55: { icon: '🌧️', desc: '이슬비' },
      61: { icon: '🌧️', desc: '비' },
      63: { icon: '🌧️', desc: '강한 비' },
      65: { icon: '🌧️', desc: '매우 강한 비' },
      71: { icon: '❄️', desc: '눈' },
      73: { icon: '❄️', desc: '눈' },
      75: { icon: '❄️', desc: '폭설' },
      80: { icon: '🌦️', desc: '소나기' },
      81: { icon: '🌦️', desc: '강한 소나기' },
      82: { icon: '⛈️', desc: '격렬한 소나기' },
      95: { icon: '⛈️', desc: '뇌우' },
      96: { icon: '⛈️', desc: '우박 뇌우' },
      99: { icon: '⛈️', desc: '강한 우박 뇌우' }
    };
    return map[code] || { icon: '☀️', desc: '맑음' };
  }

  // Weather Cache in LocalStorage
  loadWeatherCache() {
    const saved = localStorage.getItem('marathon_weather_cache_v1');
    if (saved) {
      try {
        this.weatherData = JSON.parse(saved) || {};
      } catch (e) {
        this.weatherData = {};
      }
    }
  }

  saveWeatherCache() {
    localStorage.setItem('marathon_weather_cache_v1', JSON.stringify(this.weatherData));
  }

  // Fetch Weather for Seoul (Lat: 37.5665, Lon: 126.9780) with Min/Max Temp & Smart Caching
  async fetchSeoulWeather(year, month) {
    this.loadWeatherCache();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const monthStr = String(month).padStart(2, '0');
    const totalDays = new Date(year, month, 0).getDate();

    const datesToFetch = [];
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
      const isPast = dateStr < todayStr;

      // Past date & already cached -> Skip network fetch!
      if (isPast && this.weatherData[dateStr] && this.weatherData[dateStr].tempMin !== undefined) {
        continue;
      }
      datesToFetch.push(dateStr);
    }

    if (datesToFetch.length === 0) {
      return; // All past dates in this month are already safely cached!
    }

    const startDate = datesToFetch[0];
    const monthLastDate = `${year}-${monthStr}-${String(totalDays).padStart(2, '0')}`;

    // Max forecast horizon for Open-Meteo is ~14 days from today
    const maxForecastDate = new Date(today);
    maxForecastDate.setDate(maxForecastDate.getDate() + 14);
    const maxForecastStr = maxForecastDate.toISOString().split('T')[0];

    let endDate = monthLastDate;
    if (monthLastDate > maxForecastStr) {
      endDate = maxForecastStr;
    }

    if (startDate > endDate) {
      return;
    }

    let apiUrl = '';
    const params = `daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo`;

    if (monthLastDate < todayStr) {
      // Historical Archive API
      apiUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=37.5665&longitude=126.9780&${params}&start_date=${startDate}&end_date=${monthLastDate}`;
    } else {
      // Forecast API
      apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&${params}&start_date=${startDate}&end_date=${endDate}`;
    }

    try {
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.daily && data.daily.time && data.daily.weather_code) {
          data.daily.time.forEach((t, i) => {
            const code = data.daily.weather_code[i];
            const maxTemp = data.daily.temperature_2m_max ? Math.round(data.daily.temperature_2m_max[i]) : null;
            const minTemp = data.daily.temperature_2m_min ? Math.round(data.daily.temperature_2m_min[i]) : null;

            const info = this.getWeatherInfo(code);
            info.tempMax = maxTemp;
            info.tempMin = minTemp;

            this.weatherData[t] = info;
          });
          this.saveWeatherCache();
        }
      }
    } catch (e) {
      console.log('Weather fetch failed or fallback mode:', e);
    }
  }

  // Fetch Garmin Synced Data (garmin_data.json)
  async fetchGarminData(showToast = false) {
    try {
      const response = await fetch('garmin_data.json?t=' + new Date().getTime());
      if (response.ok) {
        const json = await response.json();
        if (json && json.runs) {
          this.garminData = json.runs || {};
          this.garminLastUpdated = json.updatedAt;
          this.updateGarminStatusBadge(true);
          if (showToast) {
            alert(`✅ 가민 최신 데이터 동기화 완료! (총 ${Object.keys(this.garminData).length}건)`);
          }
          return true;
        }
      }
      if (showToast) alert('⚠️ 아직 동기화된 가민 데이터(garmin_data.json)가 없습니다.');
    } catch (e) {
      console.log('garmin_data.json not loaded yet or local mode.');
      this.updateGarminStatusBadge(false);
      if (showToast) alert('⚠️ 가민 동기화 데이터를 불러올 수 없습니다.');
    }
    return false;
  }

  updateGarminStatusBadge(isAvailable) {
    const badgeEl = document.getElementById('garmin-status-badge');
    if (badgeEl) {
      if (isAvailable && Object.keys(this.garminData).length > 0) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.innerHTML = `<i data-lucide="watch"></i> Garmin 연동됨 (${Object.keys(this.garminData).length}건)`;
        badgeEl.className = 'badge badge-neon';
      } else {
        badgeEl.style.display = 'none';
      }
    }
  }

  loadStateFromStorage() {
    const savedState = localStorage.getItem('marathon_mileage_app_v1');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        this.currentYear = parsed.currentYear || this.currentYear;
        this.currentMonth = parsed.currentMonth || this.currentMonth;
        this.targetMileage = parsed.targetMileage || 200;
        this.mileageData = parsed.mileageData || {};
      } catch (e) {
        console.error('Failed to parse saved state:', e);
      }
    }
  }

  saveStateToStorage() {
    const stateToSave = {
      currentYear: this.currentYear,
      currentMonth: this.currentMonth,
      targetMileage: this.targetMileage,
      mileageData: this.mileageData
    };
    localStorage.setItem('marathon_mileage_app_v1', JSON.stringify(stateToSave));
  }

  bindEvents() {
    document.getElementById('prev-month-btn').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => this.changeMonth(1));
    document.getElementById('today-btn').addEventListener('click', () => {
      const now = new Date();
      this.currentYear = now.getFullYear();
      this.currentMonth = now.getMonth() + 1;
      this.changeMonth(0);
    });

    const targetInput = document.getElementById('target-mileage-input');
    targetInput.value = this.targetMileage;
    targetInput.addEventListener('change', (e) => {
      let val = parseFloat(e.target.value) || 0;
      if (val < 0) val = 0;
      this.targetMileage = val;
      this.saveStateToStorage();
      this.updateDashboardMetrics();
    });

    // Garmin Manual Sync Button Handler
    const syncGarminBtn = document.getElementById('btn-sync-garmin');
    if (syncGarminBtn) {
      syncGarminBtn.addEventListener('click', async () => {
        syncGarminBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> 동기화 중...`;
        if (window.lucide) window.lucide.createIcons();

        await this.fetchGarminData(true);
        this.render();

        syncGarminBtn.innerHTML = `<i data-lucide="refresh-cw"></i> 가민 동기화`;
        if (window.lucide) window.lucide.createIcons();
      });
    }

    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (confirm('정말로 모든 수동 마일리지 및 수정 기록을 초기화하시겠습니까?')) {
        this.mileageData = {};
        this.saveStateToStorage();
        this.render();
      }
    });

    const batchModal = document.getElementById('batch-modal');
    document.getElementById('btn-open-batch').addEventListener('click', () => this.openBatchModal());
    document.getElementById('close-batch-modal').addEventListener('click', () => batchModal.classList.add('hidden'));
    document.getElementById('cancel-batch-btn').addEventListener('click', () => batchModal.classList.add('hidden'));
    document.getElementById('apply-batch-btn').addEventListener('click', () => this.handleApplyBatch());

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });

    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach(day => {
      const chk = document.getElementById(`chk-${day}`);
      const input = document.getElementById(`km-${day}`);
      if (chk && input) {
        chk.addEventListener('change', (e) => {
          input.disabled = !e.target.checked;
          if (e.target.checked && !input.value) {
            input.value = (day === 'sat' || day === 'sun') ? '15' : '8';
          }
        });
      }
    });

    const editModal = document.getElementById('single-edit-modal');
    document.getElementById('close-edit-modal').addEventListener('click', () => editModal.classList.add('hidden'));
    document.getElementById('cancel-edit-btn').addEventListener('click', () => editModal.classList.add('hidden'));
    document.getElementById('save-edit-btn').addEventListener('click', () => this.handleSaveSingleEdit());
    document.getElementById('delete-entry-btn').addEventListener('click', () => this.handleDeleteSingleEdit());

    document.querySelectorAll('.quick-chips .chip-btn').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const editKmInput = document.getElementById('edit-km');
        let currentKm = parseFloat(editKmInput.value) || 0;
        
        if (chip.dataset.add) {
          currentKm += parseFloat(chip.dataset.add);
        } else if (chip.dataset.set !== undefined) {
          currentKm = parseFloat(chip.dataset.set);
        }
        
        editKmInput.value = currentKm > 0 ? currentKm.toFixed(1) : 0;
        
        if (currentKm === 0) {
          document.querySelector('input[name="edit-type"][value="rest"]').checked = true;
        }
      });
    });
  }

  async changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear += 1;
    } else if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear -= 1;
    }
    await this.fetchSeoulWeather(this.currentYear, this.currentMonth);
    this.saveStateToStorage();
    this.render();
  }

  render() {
    this.renderHeaderMonth();
    this.renderCalendar();
    this.updateDashboardMetrics();
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderHeaderMonth() {
    document.getElementById('current-year-month').textContent = `${this.currentYear}년 ${this.currentMonth}월`;
  }

  getEffectiveEntry(dateStr) {
    const manualEntry = this.mileageData[dateStr];
    const garminEntry = this.garminData[dateStr];

    if (manualEntry !== undefined) {
      if (manualEntry.isDeleted) return null;
      return manualEntry;
    }

    if (garminEntry) {
      return {
        distance: garminEntry.distance,
        type: garminEntry.type || 'easy',
        note: garminEntry.note || '⌚ Garmin 측정 완료',
        isGarmin: true,
        pace: garminEntry.pace
      };
    }
    return null;
  }

  updateDashboardMetrics() {
    let totalKm = 0;
    let runCount = 0;
    const typeCount = { easy: 0, tempo: 0, interval: 0, lsd: 0, race: 0, rest: 0 };

    const monthPrefix = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`;
    const allDateKeys = new Set([...Object.keys(this.mileageData), ...Object.keys(this.garminData)]);

    allDateKeys.forEach(dateStr => {
      if (dateStr.startsWith(monthPrefix)) {
        const entry = this.getEffectiveEntry(dateStr);
        if (entry) {
          const dist = parseFloat(entry.distance) || 0;
          if (dist > 0 && entry.type !== 'rest') {
            totalKm += dist;
            runCount += 1;
            if (typeCount[entry.type] !== undefined) {
              typeCount[entry.type] += dist;
            }
          }
        }
      }
    });

    const targetKm = this.targetMileage;
    const percentage = targetKm > 0 ? Math.min(Math.round((totalKm / targetKm) * 100), 999) : 0;
    const remainingKm = Math.max(0, targetKm - totalKm);
    const avgDist = runCount > 0 ? (totalKm / runCount).toFixed(1) : '0.0';

    document.getElementById('total-mileage-val').textContent = totalKm.toFixed(1);
    document.getElementById('run-count-val').textContent = runCount;
    document.getElementById('avg-distance-val').textContent = avgDist;
    document.getElementById('progress-percentage-text').textContent = `${percentage}%`;
    document.getElementById('remaining-mileage-text').textContent = remainingKm > 0 
      ? `목표까지 ${remainingKm.toFixed(1)} km 남음`
      : `🎉 이번 달 목표 달성 완료! (+${(totalKm - targetKm).toFixed(1)}km)`;

    const progressBar = document.getElementById('progress-bar-fill');
    progressBar.style.width = `${Math.min(percentage, 100)}%`;

    const typeBreakdownList = document.getElementById('type-breakdown-list');
    typeBreakdownList.innerHTML = '';
    
    const typeLabels = {
      easy: { name: 'Easy Run', color: 'var(--type-easy)' },
      tempo: { name: 'Tempo', color: 'var(--type-tempo)' },
      interval: { name: 'Interval', color: 'var(--type-interval)' },
      lsd: { name: 'LSD (장거리)', color: 'var(--type-lsd)' },
      race: { name: 'Race (대회)', color: 'var(--type-race)' }
    };

    Object.keys(typeLabels).forEach(typeKey => {
      const dist = typeCount[typeKey];
      if (dist > 0) {
        const row = document.createElement('div');
        row.className = 'type-item-row';
        row.innerHTML = `
          <div class="type-dot-name">
            <span class="type-dot" style="background:${typeLabels[typeKey].color}"></span>
            <span>${typeLabels[typeKey].name}</span>
          </div>
          <strong>${dist.toFixed(1)} km</strong>
        `;
        typeBreakdownList.appendChild(row);
      }
    });

    if (runCount === 0) {
      typeBreakdownList.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">등록된 러닝 정보가 없습니다.</span>';
    }
  }

  renderCalendar() {
    const gridContainer = document.getElementById('calendar-grid');
    gridContainer.innerHTML = '';

    const year = this.currentYear;
    const month = this.currentMonth;

    const firstDayIndex = new Date(year, month - 1, 1).getDay();
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const prevMonthTotalDays = new Date(year, month - 1, 0).getDate();

    const todayStr = new Date().toISOString().split('T')[0];

    let currentWeekKm = 0;

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDayNum = prevMonthTotalDays - i;
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell other-month';
      cell.innerHTML = `<div class="cell-top"><span class="date-number">${prevDayNum}</span></div>`;
      gridContainer.appendChild(cell);
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();

      const cell = document.createElement('div');
      cell.className = `calendar-day-cell ${dateStr === todayStr ? 'is-today' : ''}`;
      cell.dataset.date = dateStr;

      let numClass = '';
      if (dayOfWeek === 0) numClass = 'sun-num';
      if (dayOfWeek === 6) numClass = 'sat-num';

      // Get Weather info & Min/Max Temp for Seoul
      const weatherInfo = this.weatherData[dateStr];
      let weatherHTML = '';
      if (weatherInfo) {
        const tempSpan = (weatherInfo.tempMin !== null && weatherInfo.tempMax !== null)
          ? `<span class="temp-text" title="서울 최저 ${weatherInfo.tempMin}℃ / 최고 ${weatherInfo.tempMax}℃">${weatherInfo.tempMin}°/${weatherInfo.tempMax}°</span>`
          : '';
        weatherHTML = `<span class="weather-icon" title="서울 날씨: ${weatherInfo.desc}">${weatherInfo.icon}</span>${tempSpan}`;
      }

      let entryHTML = '';
      const entry = this.getEffectiveEntry(dateStr);
      
      if (entry && parseFloat(entry.distance) >= 0) {
        const dist = parseFloat(entry.distance);
        if (dist > 0 || entry.type === 'rest') {
          if (entry.type !== 'rest') {
            currentWeekKm += dist;
          }

          const typeNameMap = {
            easy: 'EASY',
            tempo: 'TEMPO',
            interval: 'INT',
            lsd: 'LSD',
            race: 'RACE',
            rest: 'REST'
          };

          const garminBadge = entry.isGarmin ? '<span class="garmin-icon" title="Garmin 시계 측정 데이터">⌚</span>' : '';

          entryHTML = `
            <div class="entry-badge type-${entry.type || 'easy'}">
              <div class="entry-top-row">
                <span class="entry-km">${garminBadge}${dist > 0 ? dist + ' km' : '휴식'}</span>
                <span class="entry-tag">${typeNameMap[entry.type] || 'EASY'}</span>
              </div>
              ${entry.note ? `<div class="cell-bottom-note" title="${entry.note}">${entry.note}</div>` : ''}
            </div>
          `;
        }
      }

      cell.innerHTML = `
        <div class="cell-top">
          <div class="date-weather-wrap">
            <span class="date-number ${numClass}">${day}</span>
            ${weatherHTML}
          </div>
          <i data-lucide="plus" class="add-hover-icon"></i>
        </div>
        ${entryHTML}
      `;

      cell.addEventListener('click', () => this.openSingleEditModal(dateStr));
      gridContainer.appendChild(cell);

      if (dayOfWeek === 6 || day === totalDaysInMonth) {
        if (day === totalDaysInMonth && dayOfWeek !== 6) {
          const remainingDaysInWeek = 6 - dayOfWeek;
          for (let r = 1; r <= remainingDaysInWeek; r++) {
            const nextCell = document.createElement('div');
            nextCell.className = 'calendar-day-cell other-month';
            nextCell.innerHTML = `<div class="cell-top"><span class="date-number">${r}</span></div>`;
            gridContainer.appendChild(nextCell);
          }
        }

        const weekSummaryCell = document.createElement('div');
        weekSummaryCell.className = 'week-summary-cell';
        weekSummaryCell.innerHTML = `
          <span class="week-title">주차 소계</span>
          <span class="week-total-km">${currentWeekKm.toFixed(1)} <small style="font-size:0.7rem">km</small></span>
        `;
        gridContainer.appendChild(weekSummaryCell);
        
        currentWeekKm = 0;
      }
    }
  }

  openBatchModal() {
    const year = this.currentYear;
    const month = String(this.currentMonth).padStart(2, '0');
    const totalDays = new Date(year, this.currentMonth, 0).getDate();
    document.getElementById('batch-start-date').value = `${year}-${month}-01`;
    document.getElementById('batch-end-date').value = `${year}-${month}-${String(totalDays).padStart(2, '0')}`;
    document.getElementById('batch-modal').classList.remove('hidden');
  }

  handleApplyBatch() {
    const startDateStr = document.getElementById('batch-start-date').value;
    const endDateStr = document.getElementById('batch-end-date').value;

    if (!startDateStr || !endDateStr) {
      alert('시작일과 종료일을 입력해주세요.');
      return;
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (startDate > endDate) {
      alert('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }

    const mode = document.querySelector('input[name="batch-mode"]:checked').value;
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');

    let currentDate = new Date(startDate);
    let lsdWeekCounter = 0;

    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();

      let targetKm = 0;
      let targetType = 'easy';
      let shouldApply = false;

      if (activeTab === 'tab-daily') {
        targetKm = parseFloat(document.getElementById('daily-km').value) || 0;
        targetType = document.getElementById('daily-type').value;
        if (targetKm > 0) shouldApply = true;
      } else if (activeTab === 'tab-weekly') {
        const dayMap = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 0: 'sun' };
        const dayCode = dayMap[dayOfWeek];
        const chk = document.getElementById(`chk-${dayCode}`);
        const input = document.getElementById(`km-${dayCode}`);

        if (chk && chk.checked) {
          targetKm = parseFloat(input.value) || 0;
          targetType = document.getElementById('weekly-type').value;
          if (targetKm >= 0) shouldApply = true;
        }
      } else if (activeTab === 'tab-lsd') {
        const lsdTargetDay = parseInt(document.getElementById('lsd-day-select').value);
        if (dayOfWeek === lsdTargetDay) {
          const startKm = parseFloat(document.getElementById('lsd-start-km').value) || 16;
          const stepKm = parseFloat(document.getElementById('lsd-step-km').value) || 2;
          const maxKm = parseFloat(document.getElementById('lsd-max-km').value) || 32;

          targetKm = Math.min(startKm + (lsdWeekCounter * stepKm), maxKm);
          targetType = 'lsd';
          shouldApply = true;
          lsdWeekCounter++;
        }
      }

      if (shouldApply) {
        if (mode === 'add') {
          const prevEntry = this.getEffectiveEntry(dateKey);
          const prevDist = prevEntry ? (parseFloat(prevEntry.distance) || 0) : 0;
          targetKm = prevDist + targetKm;
        }

        this.mileageData[dateKey] = {
          distance: targetKm,
          type: targetType,
          note: targetType === 'lsd' ? `LSD ${targetKm}k (주차별 증량)` : ''
        };
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    this.saveStateToStorage();
    this.render();
    document.getElementById('batch-modal').classList.add('hidden');
    alert('마일리지가 성공적으로 일괄 등록되었습니다!');
  }

  openSingleEditModal(dateStr) {
    document.getElementById('edit-date-key').value = dateStr;
    const [y, m, d] = dateStr.split('-');
    document.getElementById('edit-modal-date-title').textContent = `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 러닝 수정`;

    const existing = this.getEffectiveEntry(dateStr) || { distance: 0, type: 'easy', note: '' };
    document.getElementById('edit-km').value = existing.distance > 0 ? existing.distance : '';
    document.getElementById('edit-note').value = existing.note || '';

    const typeRadio = document.querySelector(`input[name="edit-type"][value="${existing.type || 'easy'}"]`);
    if (typeRadio) typeRadio.checked = true;

    document.getElementById('single-edit-modal').classList.remove('hidden');
  }

  handleSaveSingleEdit() {
    const dateKey = document.getElementById('edit-date-key').value;
    const km = parseFloat(document.getElementById('edit-km').value) || 0;
    const type = document.querySelector('input[name="edit-type"]:checked').value;
    const note = document.getElementById('edit-note').value.trim();

    if (km > 0 || type === 'rest') {
      this.mileageData[dateKey] = {
        distance: type === 'rest' ? 0 : km,
        type: type,
        note: note
      };
    } else {
      if (this.garminData[dateKey]) {
        this.mileageData[dateKey] = { isDeleted: true };
      } else {
        delete this.mileageData[dateKey];
      }
    }

    this.saveStateToStorage();
    this.render();
    document.getElementById('single-edit-modal').classList.add('hidden');
  }

  handleDeleteSingleEdit() {
    const dateKey = document.getElementById('edit-date-key').value;
    if (this.garminData[dateKey]) {
      this.mileageData[dateKey] = { isDeleted: true };
    } else {
      delete this.mileageData[dateKey];
    }
    this.saveStateToStorage();
    this.render();
    document.getElementById('single-edit-modal').classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.marathonApp = new MarathonApp();
});

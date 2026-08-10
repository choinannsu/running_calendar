// Marathon Mileage Planner App State
class MarathonApp {
  constructor() {
    const today = new Date();
    this.currentYear = today.getFullYear();
    this.currentMonth = today.getMonth() + 1; // 1-indexed (1-12)
    this.targetMileage = 200; // default target km
    this.mileageData = {}; // Format: { "YYYY-MM-DD": { distance: 10, type: "tempo", note: "..." } }
    this.garminData = {};  // Garmin synced data format: { "YYYY-MM-DD": { distance: 10.5, pace: "5:10", note: "..." } }
    this.garminLastUpdated = null;

    this.init();
  }

  async init() {
    this.loadStateFromStorage();
    this.bindEvents();
    await this.fetchGarminData();
    this.render();
    
    // Initialize Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Fetch Garmin Synced Data (garmin_data.json)
  async fetchGarminData() {
    try {
      const response = await fetch('garmin_data.json?t=' + new Date().getTime());
      if (response.ok) {
        const json = await response.json();
        if (json && json.runs) {
          this.garminData = json.runs || {};
          this.garminLastUpdated = json.updatedAt;
          this.updateGarminStatusBadge(true);
        }
      }
    } catch (e) {
      console.log('garmin_data.json not loaded yet or local mode.');
      this.updateGarminStatusBadge(false);
    }
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

  // Load from LocalStorage
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

  // Save to LocalStorage
  saveStateToStorage() {
    const stateToSave = {
      currentYear: this.currentYear,
      currentMonth: this.currentMonth,
      targetMileage: this.targetMileage,
      mileageData: this.mileageData
    };
    localStorage.setItem('marathon_mileage_app_v1', JSON.stringify(stateToSave));
  }

  // Event Listeners
  bindEvents() {
    // Month Selector Buttons
    document.getElementById('prev-month-btn').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('next-month-btn').addEventListener('click', () => this.changeMonth(1));
    document.getElementById('today-btn').addEventListener('click', () => {
      const now = new Date();
      this.currentYear = now.getFullYear();
      this.currentMonth = now.getMonth() + 1;
      this.render();
    });

    // Target Mileage Input
    const targetInput = document.getElementById('target-mileage-input');
    targetInput.value = this.targetMileage;
    targetInput.addEventListener('change', (e) => {
      let val = parseFloat(e.target.value) || 0;
      if (val < 0) val = 0;
      this.targetMileage = val;
      this.saveStateToStorage();
      this.updateDashboardMetrics();
    });

    // Sample Data Button
    document.getElementById('btn-sample-data').addEventListener('click', () => this.loadSampleData());

    // Clear All Button
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (confirm('정말로 모든 수동 마일리지 기록을 초기화하시겠습니까?')) {
        this.mileageData = {};
        this.saveStateToStorage();
        this.render();
      }
    });

    // Modal Control: Batch Modal
    const batchModal = document.getElementById('batch-modal');
    document.getElementById('btn-open-batch').addEventListener('click', () => this.openBatchModal());
    document.getElementById('close-batch-modal').addEventListener('click', () => batchModal.classList.add('hidden'));
    document.getElementById('cancel-batch-btn').addEventListener('click', () => batchModal.classList.add('hidden'));
    document.getElementById('apply-batch-btn').addEventListener('click', () => this.handleApplyBatch());

    // Batch Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });

    // Weekly Pattern Checkboxes enable/disable inputs
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

    // Modal Control: Single Edit Modal
    const editModal = document.getElementById('single-edit-modal');
    document.getElementById('close-edit-modal').addEventListener('click', () => editModal.classList.add('hidden'));
    document.getElementById('cancel-edit-btn').addEventListener('click', () => editModal.classList.add('hidden'));
    document.getElementById('save-edit-btn').addEventListener('click', () => this.handleSaveSingleEdit());
    document.getElementById('delete-entry-btn').addEventListener('click', () => this.handleDeleteSingleEdit());

    // Quick Chip Buttons in Single Edit Modal
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

  changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear += 1;
    } else if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear -= 1;
    }
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
    const garminEntry = this.garminData[dateStr];
    const manualEntry = this.mileageData[dateStr];

    if (garminEntry) {
      return {
        distance: garminEntry.distance,
        type: garminEntry.type || 'easy',
        note: garminEntry.note || '⌚ Garmin 측정 완료',
        isGarmin: true,
        pace: garminEntry.pace
      };
    }
    return manualEntry || null;
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

    // 1. Prev Month Overflow Days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDayNum = prevMonthTotalDays - i;
      const cell = document.createElement('div');
      cell.className = 'calendar-day-cell other-month';
      cell.innerHTML = `<div class="cell-top"><span class="date-number">${prevDayNum}</span></div>`;
      gridContainer.appendChild(cell);
    }

    // 2. Current Month Days
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();

      const cell = document.createElement('div');
      cell.className = `calendar-day-cell ${dateStr === todayStr ? 'is-today' : ''}`;
      cell.dataset.date = dateStr;

      let numClass = '';
      if (dayOfWeek === 0) numClass = 'sun-num';
      if (dayOfWeek === 6) numClass = 'sat-num';

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
          <span class="date-number ${numClass}">${day}</span>
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
        if (mode === 'add' && this.mileageData[dateKey]) {
          const prevDist = parseFloat(this.mileageData[dateKey].distance) || 0;
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
      delete this.mileageData[dateKey];
    }

    this.saveStateToStorage();
    this.render();
    document.getElementById('single-edit-modal').classList.add('hidden');
  }

  handleDeleteSingleEdit() {
    const dateKey = document.getElementById('edit-date-key').value;
    if (this.mileageData[dateKey]) {
      delete this.mileageData[dateKey];
      this.saveStateToStorage();
      this.render();
    }
    document.getElementById('single-edit-modal').classList.add('hidden');
  }

  loadSampleData() {
    if (!confirm('샘플 풀마라톤 훈련 계획을 불러오시겠습니까? (기존 데이터에 추가됩니다)')) return;

    const year = this.currentYear;
    const month = String(this.currentMonth).padStart(2, '0');
    const daysInMonth = new Date(year, this.currentMonth, 0).getDate();

    let lsdKm = 18;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, this.currentMonth - 1, day).getDay();

      if (dayOfWeek === 1) {
        this.mileageData[dateStr] = { distance: 0, type: 'rest', note: '완전 휴식' };
      } else if (dayOfWeek === 2) {
        this.mileageData[dateStr] = { distance: 8, type: 'easy', note: '조깅 페이스 5:30' };
      } else if (dayOfWeek === 3) {
        this.mileageData[dateStr] = { distance: 10, type: 'interval', note: '1km x 5회 (페이스 4:15)' };
      } else if (dayOfWeek === 4) {
        this.mileageData[dateStr] = { distance: 8, type: 'easy', note: '회복 조깅' };
      } else if (dayOfWeek === 5) {
        this.mileageData[dateStr] = { distance: 12, type: 'tempo', note: '빌드업 템포런' };
      } else if (dayOfWeek === 6) {
        this.mileageData[dateStr] = { distance: lsdKm, type: 'lsd', note: `주말 LSD ${lsdKm}km` };
        lsdKm = Math.min(lsdKm + 2, 32);
      } else if (dayOfWeek === 0) {
        this.mileageData[dateStr] = { distance: 5, type: 'easy', note: '가벼운 폼롤링 & 조깅' };
      }
    }

    this.targetMileage = 220;
    document.getElementById('target-mileage-input').value = 220;
    this.saveStateToStorage();
    this.render();
    alert('샘플 풀마라톤 훈련 계획이 적용되었습니다!');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.marathonApp = new MarathonApp();
});

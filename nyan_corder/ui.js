// ui.js
// にゃんコーダーV2 UI制御
// 基本フロー: 猫クリック → アイコン光る → 鈴登場 → 実行

(() => {
  // =========================
  // 状態管理
  // =========================
  let currentMode = null;      // "encode" or "decode"
  let encodeFiles = null;      // FileList or File[]
  let decodeNyacFile = null;   // File (.nyan)
  let currentPassword = "";    // 共通パスワード
  let customFilename = "";     // カスタムファイル名（エンコード用）

  const MIN_PAW_DURATION = 4000; // 足跡アニメ最低時間(ms) ※余裕を持って4秒
  const AUTO_SLEEP_TIME = 10000; // 自動スリープまでの時間(ms) 10秒
  let isModalOpen = false;       // モーダル開いてるか

  // =========================
  // 猫の状態管理
  // =========================
  const CAT_STATES = {
    SLEEP_CLOSED: 'sleep_closed',   // 寝てる（目を閉じてる）
    SLEEP_OPEN: 'sleep_open',       // 寝てる姿勢で目が開いた
    SHINE_EYES: 'shine_eyes',       // 目が光ってる（処理中）
    SIT_NORMAL: 'sit_normal',       // 通常座り（選択中）
    SIT_SMILE: 'sit_smile',         // スマイル（成功）
    SAD: 'sad'                      // しょんぼり（失敗）
  };

  // 猫ごとの画像パスマップ
  const CAT_IMAGES = {
    enko: {
      [CAT_STATES.SLEEP_CLOSED]: 'img/cat/cats_sleep_closed_enko.png',
      [CAT_STATES.SLEEP_OPEN]: 'img/cat/cats_sleep_open_enko.png',
      [CAT_STATES.SHINE_EYES]: 'img/cat/shine_eyes_enko.png',
      [CAT_STATES.SIT_NORMAL]: 'img/cat/cats_sit_normal_enko.png',
      [CAT_STATES.SIT_SMILE]: 'img/cat/cats_sit_smile_enko.png',
      [CAT_STATES.SAD]: 'img/cat/sad-cat_enko.png'
    },
    deko: {
      [CAT_STATES.SLEEP_CLOSED]: 'img/cat/cats_sleep_closed_deko.png',
      [CAT_STATES.SLEEP_OPEN]: 'img/cat/cats_sleep_open_deko.png',
      [CAT_STATES.SHINE_EYES]: 'img/cat/shine_eyes_deko.png',
      [CAT_STATES.SIT_NORMAL]: 'img/cat/cats_sit_normal_deko.png',
      [CAT_STATES.SIT_SMILE]: 'img/cat/cats_sit_smile_deko.png',
      [CAT_STATES.SAD]: 'img/cat/sad-cat_deko.png'
    }
  };

  // 現在の猫の状態
  let enkoState = CAT_STATES.SLEEP_CLOSED;
  let dekoState = CAT_STATES.SLEEP_CLOSED;

  /**
   * 猫の画像を切り替える（フェード効果付き）
   * @param {HTMLImageElement} imgElement - 猫の画像要素
   * @param {string} catType - 'enko' or 'deko'
   * @param {string} newState - CAT_STATESの値
   */
  function changeCatState(imgElement, catType, newState) {
    if (!imgElement || !CAT_IMAGES[catType] || !CAT_IMAGES[catType][newState]) {
      return;
    }

    // 現在の状態を更新
    if (catType === 'enko') {
      enkoState = newState;
    } else {
      dekoState = newState;
    }

    // フェードアウト
    imgElement.classList.add('fade-out');

    setTimeout(() => {
      // 画像を切り替え
      imgElement.src = CAT_IMAGES[catType][newState];
      imgElement.dataset.state = newState;

      // フェードイン
      imgElement.classList.remove('fade-out');
      imgElement.classList.add('fade-in');

      setTimeout(() => {
        imgElement.classList.remove('fade-in');
      }, 300);
    }, 300);
  }

  /**
   * 猫の画像を即座に切り替える（フェードなし・処理開始時用）
   * 画像の読み込み完了を待つPromiseを返す
   */
  function changeCatStateImmediate(imgElement, catType, newState) {
    return new Promise((resolve) => {
      if (!imgElement || !CAT_IMAGES[catType] || !CAT_IMAGES[catType][newState]) {
        resolve();
        return;
      }

      // 現在の状態を更新
      if (catType === 'enko') {
        enkoState = newState;
      } else {
        dekoState = newState;
      }

      // 即座に画像を切り替え（フェードなし）
      imgElement.classList.remove('fade-out', 'fade-in');

      // 画像読み込み完了を待つ
      const newSrc = CAT_IMAGES[catType][newState];
      if (imgElement.src.endsWith(newSrc.split('/').pop())) {
        // 同じ画像なら即resolve
        resolve();
      } else {
        imgElement.onload = () => {
          imgElement.onload = null;
          resolve();
        };
        imgElement.src = newSrc;
        imgElement.dataset.state = newState;
      }
    });
  }

  /**
   * ブラウザの描画を確実に待つ（2フレーム待機）
   */
  function waitForRender() {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  /**
   * 猫をリセット（初期状態に戻す）
   */
  function resetCats() {
    if (enkoImg) {
      enkoImg.classList.remove('processing');
      changeCatState(enkoImg, 'enko', CAT_STATES.SLEEP_CLOSED);
    }
    if (dekoImg) {
      dekoImg.classList.remove('processing');
      changeCatState(dekoImg, 'deko', CAT_STATES.SLEEP_CLOSED);
    }
  }

  // =========================
  // DOM 取得
  // =========================

  // 猫画像
  const enkoImg = document.getElementById('enko-img');
  const dekoImg = document.getElementById('deko-img');
  const enkoBlock = document.getElementById('enko-block');
  const dekoBlock = document.getElementById('deko-block');

  // アイコンボタン（alt 属性からたどる）
  const folderBtn = document.querySelector('.icon-area img[alt="folder"]')?.closest('button');
  const bellBtn   = document.querySelector('.icon-area img[alt="bell"]')?.closest('button');
  const keyBtn    = document.querySelector('.icon-area img[alt="key"]')?.closest('button');

  // 鈴ボタンに専用クラスを追加（CSS用）
  if (bellBtn) {
    bellBtn.classList.add('bell-btn');
  }

  // 足跡
  const pawTrack = document.querySelector('.paw-track');
  const pawElems = pawTrack ? pawTrack.querySelectorAll('.paw') : [];

  // モーダル関連
  const encodeModal = document.getElementById('encode-modal');
  const decodeModal = document.getElementById('decode-modal');
  const encodeSelectBtn = document.getElementById('encode-select-btn');
  const decodeSelectBtn = document.getElementById('decode-select-btn');
  const encodePasswordInput = document.getElementById('encode-password');
  const decodePasswordInput = document.getElementById('decode-password');
  const encodeOkBtn = document.getElementById('encode-ok-btn');
  const decodeOkBtn = document.getElementById('decode-ok-btn');
  const encodeNoPasswordChk = document.getElementById('encode-no-password');
  const decodeNoPasswordChk = document.getElementById('decode-no-password');

  // エラーモーダル関連
  const errorModal = document.getElementById('error-modal');
  const errorCloseBtn = errorModal ? errorModal.querySelector('.error-close') : null;

  // インフォモーダル関連
  const infoModal = document.getElementById('info-modal');
  const infoCloseBtn = infoModal ? infoModal.querySelector('.info-close') : null;
  const infoMessageText = document.getElementById('info-message-text');

  // パスワード表示切り替えボタン
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === 'password') {
          input.type = 'text';
          btn.textContent = '🔓';
        } else {
          input.type = 'password';
          btn.textContent = '🔒';
        }
      }
    });
  });

  // =========================
  // UI状態管理
  // =========================

  // すべてのアイコンの光りをリセット
  function clearAllGlow() {
    folderBtn?.classList.remove('glow');
    keyBtn?.classList.remove('glow');
  }

  // 鈴を隠す
  function hideBell() {
    if (bellBtn) {
      bellBtn.classList.remove('visible');
    }
  }

  // 鈴を表示
  function showBell() {
    if (bellBtn) {
      bellBtn.classList.add('visible');
    }
  }

  // 鈴を表示すべきか判定
  function checkBellCondition() {
    if (!currentMode) return;

    if (currentMode === 'encode') {
      const hasFiles = encodeFiles && encodeFiles.length > 0;
      const passwordSet = currentPassword !== null && currentPassword !== undefined;

      if (hasFiles && passwordSet) {
        showBell();
      } else {
        hideBell();
      }
    } else if (currentMode === 'decode') {
      const hasFile = decodeNyacFile !== null;
      const passwordSet = currentPassword !== null && currentPassword !== undefined;

      if (hasFile && passwordSet) {
        showBell();
      } else {
        hideBell();
      }
    }
  }

  // =========================
  // 足跡アニメーション
  // =========================

  let pawTimer = null;

  function resetPaws() {
    if (!pawElems) return;
    pawElems.forEach(p => p.classList.remove('active'));
  }

  let pawAnimationResolve = null;

  function startPawAnimation() {
    if (!pawElems || pawElems.length === 0) return Promise.resolve();

    if (pawTrack) {
      pawTrack.classList.add('visible');

      if (currentMode === 'decode') {
        pawTrack.classList.add('reverse');
      } else {
        pawTrack.classList.remove('reverse');
      }
    }

    resetPaws();
    let index = 0;
    const count = pawElems.length;
    const stepMs = MIN_PAW_DURATION / count;

    return new Promise((resolve) => {
      pawAnimationResolve = resolve;

      pawTimer = setInterval(() => {
        if (index < count) {
          pawElems[index].classList.add('active');
          index++;
        } else {
          clearInterval(pawTimer);
          pawTimer = null;
          resolve();
        }
      }, stepMs);
    });
  }

  function waitForPawAnimation() {
    return new Promise((resolve) => {
      if (!pawTimer) {
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (!pawTimer) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      }
    });
  }

  function fillPaws() {
    if (pawTimer) {
      clearInterval(pawTimer);
      pawTimer = null;
    }
    if (!pawElems) return;
    pawElems.forEach(p => p.classList.add('active'));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =========================
  // 隠し input（ファイル選択）
  // =========================

  // エンコード用：複数ファイル or フォルダ
  const encodeInput = document.createElement('input');
  encodeInput.type = 'file';
  encodeInput.multiple = true;
  encodeInput.webkitdirectory = true;
  encodeInput.style.display = 'none';
  document.body.appendChild(encodeInput);

  encodeInput.addEventListener('change', () => {
    encodeFiles = encodeInput.files;

    if (encodeSelectBtn && encodeFiles.length > 0) {
      const cats = '🐱'.repeat(Math.min(encodeFiles.length, 5));
      const extra = encodeFiles.length > 5 ? ` +${encodeFiles.length - 5}` : '';
      encodeSelectBtn.innerHTML = `${cats}<br>${encodeFiles.length}匹入ったよ${extra}`;
      encodeSelectBtn.disabled = true;
    }

    checkEncodeModalReady();
  });

  // デコード用：.nyan ファイル 1つ
  const decodeInput = document.createElement('input');
  decodeInput.type = 'file';
  decodeInput.accept = '.nyan,.zip,text/plain,application/zip';
  decodeInput.style.display = 'none';
  document.body.appendChild(decodeInput);

  decodeInput.addEventListener('change', () => {
    decodeNyacFile = decodeInput.files[0] || null;

    if (decodeSelectBtn && decodeNyacFile) {
      const shortName = decodeNyacFile.name.length > 20
        ? decodeNyacFile.name.substring(0, 20) + '...'
        : decodeNyacFile.name;
      decodeSelectBtn.innerHTML = `🎁<br>${shortName}`;
      decodeSelectBtn.disabled = true;
    }

    checkDecodeModalReady();
  });

  // =========================
  // モーダル制御
  // =========================

  function openEncodeModal() {
    isModalOpen = true;
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }

    if (encodeModal) {
      encodeModal.classList.remove('hidden');
      encodeFiles = null;
      currentPassword = "";
      if (encodePasswordInput) {
        encodePasswordInput.value = "";
        encodePasswordInput.type = "password";
        encodePasswordInput.disabled = false;
      }
      if (encodeSelectBtn) {
        encodeSelectBtn.disabled = false;
        encodeSelectBtn.innerHTML = "フォルダを選ぶ 📂";
      }
      if (encodeOkBtn) {
        encodeOkBtn.disabled = true;
      }
      if (encodeNoPasswordChk) {
        encodeNoPasswordChk.checked = false;
      }
      const toggleBtn = encodeModal.querySelector('.password-toggle');
      if (toggleBtn) toggleBtn.textContent = '🔒';
    }
  }

  function closeEncodeModal(shouldReset = false) {
    resetSleepTimer();

    const filenameInput = document.getElementById('encode-filename');
    if (filenameInput) {
      filenameInput.value = '';
    }

    if (shouldReset) {
      encodeFiles = null;
      encodeInput.value = '';
    }

    if (encodeModal) {
      isModalOpen = false;
      encodeModal.classList.add('hidden');
    }
  }

  function openDecodeModal() {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    isModalOpen = true;

    if (decodeModal) {
      decodeModal.classList.remove('hidden');
      decodeNyacFile = null;
      currentPassword = "";
      if (decodePasswordInput) {
        decodePasswordInput.value = "";
        decodePasswordInput.type = "password";
        decodePasswordInput.disabled = false;
      }
      if (decodeSelectBtn) {
        decodeSelectBtn.disabled = false;
        decodeSelectBtn.innerHTML = "ファイルを選ぶ 🔐";
      }
      if (decodeOkBtn) {
        decodeOkBtn.disabled = true;
      }
      if (decodeNoPasswordChk) {
        decodeNoPasswordChk.checked = false;
      }
      const toggleBtn = decodeModal.querySelector('.password-toggle');
      if (toggleBtn) toggleBtn.textContent = '🔒';
    }
  }

  function closeDecodeModal(shouldReset = false) {
    resetSleepTimer();

    if (shouldReset) {
      decodeNyacFile = null;
      decodeInput.value = '';
    }

    if (decodeModal) {
      decodeModal.classList.add('hidden');
    }
  }

  function showErrorModal() {
    if (errorModal) {
      errorModal.classList.remove('hidden');
    }
  }

  function closeErrorModal() {
    if (errorModal) {
      errorModal.classList.add('hidden');
    }
    resetPaws();
    resetCats();
    decodeNyacFile = null;
    encodeFiles = null;
    currentPassword = "";
    currentMode = null;
    clearAllGlow();
    if (pawTrack) {
      pawTrack.classList.remove('visible');
      pawTrack.classList.remove('reverse');
    }
    encodeInput.value = '';
    decodeInput.value = '';
    resetSleepTimer();
  }

  function showInfoModal(messageHtml) {
    if (infoModal) {
      if (infoMessageText && messageHtml) {
        infoMessageText.innerHTML = messageHtml;
      }
      infoModal.classList.remove('hidden');
    }
  }

  function closeInfoModal() {
    if (infoModal) {
      infoModal.classList.add('hidden');
    }
    resetSleepTimer();
  }

  isModalOpen = false;

  function checkEncodeModalReady() {
    if (encodeOkBtn) {
      const hasFiles = encodeFiles && encodeFiles.length > 0;
      const noPassword = encodeNoPasswordChk && encodeNoPasswordChk.checked;
      const hasPassword = encodePasswordInput && encodePasswordInput.value.trim() !== "";

      encodeOkBtn.disabled = !(hasFiles && (noPassword || hasPassword));
    }
  }

  function checkDecodeModalReady() {
    if (decodeOkBtn) {
      const hasFile = decodeNyacFile !== null;
      const noPassword = decodeNoPasswordChk && decodeNoPasswordChk.checked;
      const hasPassword = decodePasswordInput && decodePasswordInput.value.trim() !== "";

      decodeOkBtn.disabled = !(hasFile && (noPassword || hasPassword));
    }
  }

  // モーダルのイベント設定
  if (encodeSelectBtn) {
    encodeSelectBtn.addEventListener('click', () => {
      encodeInput.click();
    });
  }

  if (decodeSelectBtn) {
    decodeSelectBtn.addEventListener('click', () => {
      decodeInput.click();
    });
  }

  if (encodePasswordInput) {
    encodePasswordInput.addEventListener('input', checkEncodeModalReady);
  }

  if (decodePasswordInput) {
    decodePasswordInput.addEventListener('input', checkDecodeModalReady);
  }

  if (encodeNoPasswordChk) {
    encodeNoPasswordChk.addEventListener('change', () => {
      if (encodePasswordInput) {
        encodePasswordInput.disabled = encodeNoPasswordChk.checked;
        if (encodeNoPasswordChk.checked) {
          encodePasswordInput.value = "";
        }
      }
      checkEncodeModalReady();
    });
  }

  if (decodeNoPasswordChk) {
    decodeNoPasswordChk.addEventListener('change', () => {
      if (decodePasswordInput) {
        decodePasswordInput.disabled = decodeNoPasswordChk.checked;
        if (decodeNoPasswordChk.checked) {
          decodePasswordInput.value = "";
        }
      }
      checkDecodeModalReady();
    });
  }

  if (encodeOkBtn) {
    encodeOkBtn.addEventListener('click', () => {
      const filenameInput = document.getElementById('encode-filename');
      customFilename = filenameInput ? filenameInput.value.trim() : '';

      if (encodeNoPasswordChk && encodeNoPasswordChk.checked) {
        currentPassword = "";
      } else if (encodePasswordInput) {
        currentPassword = encodePasswordInput.value.trim();
      }
      closeEncodeModal();
      checkBellCondition();
    });
  }

  if (decodeOkBtn) {
    decodeOkBtn.addEventListener('click', () => {
      if (decodeNoPasswordChk && decodeNoPasswordChk.checked) {
        currentPassword = "";
      } else if (decodePasswordInput) {
        currentPassword = decodePasswordInput.value.trim();
      }
      closeDecodeModal();
      checkBellCondition();
    });
  }

  // 閉じるボタン
  if (encodeModal) {
    const closeBtn = encodeModal.querySelector('.file-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeEncodeModal(true));
    }
    encodeModal.addEventListener('click', (e) => {
      if (e.target === encodeModal) {
        closeEncodeModal(true);
      }
    });
  }

  if (decodeModal) {
    const closeBtn = decodeModal.querySelector('.file-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeDecodeModal(true));
    }
    decodeModal.addEventListener('click', (e) => {
      if (e.target === decodeModal) {
        closeDecodeModal(true);
      }
    });
  }

  if (errorCloseBtn) {
    errorCloseBtn.addEventListener('click', closeErrorModal);
  }
  if (errorModal) {
    errorModal.addEventListener('click', (e) => {
      if (e.target === errorModal) {
        closeErrorModal();
      }
    });
  }

  if (infoCloseBtn) {
    infoCloseBtn.addEventListener('click', closeInfoModal);
  }
  if (infoModal) {
    infoModal.addEventListener('click', (e) => {
      if (e.target === infoModal) {
        closeInfoModal();
      }
    });
  }

  // =========================
  // モード切り替え（enko / deko）
  // =========================

  function setMode(mode) {
    currentMode = mode;

    clearAllGlow();
    hideBell();

    if (mode === 'encode') {
      changeCatState(enkoImg, 'enko', CAT_STATES.SIT_NORMAL);
      if (dekoState !== CAT_STATES.SLEEP_CLOSED) {
        changeCatState(dekoImg, 'deko', CAT_STATES.SLEEP_CLOSED);
      }
      folderBtn?.classList.add('glow');
    } else if (mode === 'decode') {
      changeCatState(dekoImg, 'deko', CAT_STATES.SIT_NORMAL);
      if (enkoState !== CAT_STATES.SLEEP_CLOSED) {
        changeCatState(enkoImg, 'enko', CAT_STATES.SLEEP_CLOSED);
      }
      keyBtn?.classList.add('glow');
    }

    encodeFiles = null;
    decodeNyacFile = null;
    currentPassword = "";
  }

  // enkoのイベント
  if (enkoImg && enkoBlock) {
    enkoBlock.addEventListener('mouseenter', () => {
      if (enkoState === CAT_STATES.SLEEP_CLOSED) {
        changeCatState(enkoImg, 'enko', CAT_STATES.SLEEP_OPEN);
      }
    });

    enkoBlock.addEventListener('mouseleave', () => {
      if (enkoState === CAT_STATES.SLEEP_OPEN) {
        changeCatState(enkoImg, 'enko', CAT_STATES.SLEEP_CLOSED);
      }
    });

    enkoImg.addEventListener('click', () => {
      setMode('encode');
    });
  }

  // dekoのイベント
  if (dekoImg && dekoBlock) {
    dekoBlock.addEventListener('mouseenter', () => {
      if (dekoState === CAT_STATES.SLEEP_CLOSED) {
        changeCatState(dekoImg, 'deko', CAT_STATES.SLEEP_OPEN);
      }
    });

    dekoBlock.addEventListener('mouseleave', () => {
      if (dekoState === CAT_STATES.SLEEP_OPEN) {
        changeCatState(dekoImg, 'deko', CAT_STATES.SLEEP_CLOSED);
      }
    });

    dekoImg.addEventListener('click', () => {
      setMode('decode');
    });
  }

  // =========================
  // フォルダアイコン：ファイル選択
  // =========================

  if (folderBtn) {
    folderBtn.addEventListener('click', () => {
      if (!currentMode) {
        showInfoModal('<span class="red">enko</span> か <span class="red">deko</span> を選んでね');
        return;
      }
      if (currentMode === 'encode') {
        openEncodeModal();
      }
    });
  }

  // =========================
  // 鍵アイコン：モーダルを開く
  // =========================

  if (keyBtn) {
    keyBtn.addEventListener('click', () => {
      if (!currentMode) {
        showInfoModal('<span class="red">enko</span> か <span class="red">deko</span> を選んでね');
        return;
      }

      if (currentMode === 'decode') {
        openDecodeModal();
      }
    });
  }

  // =========================
  // 鈴アイコン：処理実行
  // =========================

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBytes(filename, bytes) {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runEncodeFlow() {
    if (!encodeFiles || encodeFiles.length === 0) {
      showInfoModal("ファイルを選択してね");
      return;
    }
    if (!currentPassword && currentPassword !== "") {
      showInfoModal("鍵ワードを入力してね");
      return;
    }

    hideBell();

    if (enkoImg) {
      await changeCatStateImmediate(enkoImg, 'enko', CAT_STATES.SHINE_EYES);
      enkoImg.classList.add('processing');
    }

    const pawPromise = startPawAnimation();

    await waitForRender();

    try {
      const encodePromise = new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            const result = await EncodeCore.runEncode(encodeFiles, currentPassword || "", customFilename);
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }, 100);
      });

      const [result] = await Promise.all([
        encodePromise,
        pawPromise
      ]);

      downloadBlob(result.filename, result.blob);

      if (enkoImg) {
        enkoImg.classList.remove('processing');
        changeCatState(enkoImg, 'enko', CAT_STATES.SIT_SMILE);
      }
    } catch (e) {
      console.error(e);

      fillPaws();

      if (enkoImg) {
        enkoImg.classList.remove('processing');
        changeCatState(enkoImg, 'enko', CAT_STATES.SAD);
      }

      showErrorModal();
      return;
    }

    fillPaws();
    setTimeout(() => {
      resetPaws();
      resetCats();
      encodeFiles = null;
      currentPassword = "";
      customFilename = "";
      currentMode = null;
      clearAllGlow();
      encodeInput.value = '';
      if (pawTrack) {
        pawTrack.classList.remove('visible');
        pawTrack.classList.remove('reverse');
      }
    }, 1500);
  }

  async function runDecodeFlow() {
    if (!decodeNyacFile) {
      showInfoModal("ファイルを選択してね");
      return;
    }
    if (!currentPassword && currentPassword !== "") {
      showInfoModal("鍵ワードを入力してね");
      return;
    }

    hideBell();

    if (dekoImg) {
      await changeCatStateImmediate(dekoImg, 'deko', CAT_STATES.SHINE_EYES);
      dekoImg.classList.add('processing');
    }

    const pawPromise = startPawAnimation();

    await waitForRender();

    try {
      const decodePromise = new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            const result = await DecodeCore.runDecodeFromFile(decodeNyacFile, currentPassword || "");
            resolve(result);
          } catch (e) {
            reject(e);
          }
        }, 100);
      });

      const [result] = await Promise.all([
        decodePromise,
        pawPromise
      ]);

      if (result.isJson) {
        const jsonStr = JSON.stringify(result.jsonData, null, 2);
        const jsonBlob = new Blob([jsonStr], { type: 'application/json' });

        const baseName = decodeNyacFile.name.replace(/\.(nyan|zip)$/i, '');
        const now = new Date();
        const hour = now.getHours();
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hour}時${minute}分頃`;
        const jsonFilename = `Re：${baseName}_${timeStr}.json`;

        downloadBlob(jsonFilename, jsonBlob);
      } else {
        const zip = new JSZip();

        let rootFolder = '';
        if (result.entries.length > 0) {
          const firstPath = result.entries[0].name;
          const firstSlash = firstPath.indexOf('/');
          if (firstSlash !== -1) {
            rootFolder = firstPath.substring(0, firstSlash + 1);
          }
        }

        for (const entry of result.entries) {
          const cleanPath = rootFolder && entry.name.startsWith(rootFolder)
            ? entry.name.substring(rootFolder.length)
            : entry.name;

          zip.file(cleanPath, entry.contentBytes);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        const baseName = decodeNyacFile.name.replace(/\.(nyan|zip)$/i, '');
        const now = new Date();
        const hour = now.getHours();
        const minute = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hour}時${minute}分頃`;

        const zipFilename = `Re：${baseName}_${timeStr}.zip`;

        downloadBlob(zipFilename, zipBlob);
      }

      if (dekoImg) {
        dekoImg.classList.remove('processing');
        changeCatState(dekoImg, 'deko', CAT_STATES.SIT_SMILE);
      }
    } catch (e) {
      console.error(e);

      fillPaws();

      if (dekoImg) {
        dekoImg.classList.remove('processing');
        changeCatState(dekoImg, 'deko', CAT_STATES.SAD);
      }

      showErrorModal();
      return;
    }

    fillPaws();
    setTimeout(() => {
      resetPaws();
      resetCats();
      decodeNyacFile = null;
      currentPassword = "";
      currentMode = null;
      clearAllGlow();
      decodeInput.value = '';
      if (pawTrack) {
        pawTrack.classList.remove('visible');
        pawTrack.classList.remove('reverse');
      }
    }, 1500);
  }

  if (bellBtn) {
    bellBtn.addEventListener('click', async () => {
      if (!currentMode) {
        showInfoModal('<span class="red">enko</span> か <span class="red">deko</span> を選んでね');
        return;
      }
      if (currentMode === 'encode') {
        await runEncodeFlow();
      } else {
        await runDecodeFlow();
      }
    });
  }

  // =========================
  // 自動スリープ機能
  // =========================

  let sleepTimer = null;

  function resetSleepTimer() {
    if (sleepTimer) {
      clearTimeout(sleepTimer);
    }
    sleepTimer = setTimeout(() => {
      autoSleep();
    }, AUTO_SLEEP_TIME);
  }

  function autoSleep() {
    resetCats();

    currentMode = null;
    clearAllGlow();
    hideBell();

    encodeFiles = null;
    decodeNyacFile = null;
    currentPassword = "";
  }

  document.addEventListener('click', () => {
    if (!isModalOpen) {
      resetSleepTimer();
    }
  });
  document.addEventListener('keypress', () => {
    if (!isModalOpen) {
      resetSleepTimer();
    }
  });

  resetSleepTimer();
})();

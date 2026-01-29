// memo.js
// テキスト ⇔ にゃん語 変換用（V2）

// NyancoderCore のユーティリティを使って、文字列だけを変換する
const MemoCore = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  // シンプルにテキスト → にゃん語
  function encodeTextToNyan(text) {
    const srcBytes = encoder.encode(text);
    return NyancoderCore.bytesToNyango(srcBytes);
  }

  // シンプルににゃん語 → テキスト
  function decodeNyanToText(nyanText) {
    const trimmed = nyanText.trim();
    const bytes = NyancoderCore.nyangoToBytes(trimmed);
    return decoder.decode(bytes);
  }

  return {
    encodeTextToNyan,
    decodeNyanToText,
  };
})();

// UI バインド
document.addEventListener("DOMContentLoaded", () => {
  const memoButton  = document.getElementById("nego-button");
  const modal       = document.getElementById("memo-modal");
  const closeBtn    = document.getElementById("memo-close");

  const modeEncodeBtn = document.getElementById("memo-mode-encode");
  const modeDecodeBtn = document.getElementById("memo-mode-decode");

  const inputEl     = document.getElementById("memo-input");
  const outputEl    = document.getElementById("memo-output");
  const runBtn      = document.getElementById("memo-run");

  let mode = "encode"; // "encode" | "decode"

  function openModal() {
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  memoButton.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);

  // 背景クリックで閉じる（ダイアログ外クリック）
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  function setMode(newMode) {
    mode = newMode;
    if (mode === "encode") {
      modeEncodeBtn.classList.add("active");
      modeDecodeBtn.classList.remove("active");
    } else {
      modeEncodeBtn.classList.remove("active");
      modeDecodeBtn.classList.add("active");
    }
  }

  modeEncodeBtn.addEventListener("click", () => setMode("encode"));
  modeDecodeBtn.addEventListener("click", () => setMode("decode"));

  runBtn.addEventListener("click", () => {
    const text = inputEl.value;
    if (!text) {
      return;
    }

    try {
      let result;
      if (mode === "encode") {
        result = MemoCore.encodeTextToNyan(text);
      } else {
        result = MemoCore.decodeNyanToText(text);
      }
      outputEl.value = result;
    } catch (err) {
      console.error(err);
      outputEl.value = ""; // 失敗時は出力を空に
    }
  });
});

// クリア
document.getElementById("memo-clear")?.addEventListener("click", () => {
  document.getElementById("memo-input").value = "";
});

// コピー
document.getElementById("memo-copy")?.addEventListener("click", function() {
  const out = document.getElementById("memo-output").value;
  navigator.clipboard.writeText(out);
  
  // コピー完了フィードバック
  const btn = this;
  const originalText = btn.textContent;
  btn.textContent = "にゃん！";
  
  setTimeout(() => {
    btn.textContent = originalText;
  }, 1000);
});
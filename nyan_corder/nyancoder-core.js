// nyancoder-core.js
// にゃんコーダーV2 暗号ロジック専用モジュール

const NyancoderCore = (() => {

  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  // 16種類のにゃん語（4bit を2つで1byteに変換）
  const NYAN_TOKENS = [
    "にゃー","にゃあ","にゃお","にゃん",
    "にゃっ","みゃー","みゃあ","みゃお",
    "みゃう","みゃっ","まー","まーお",
    "ふー","うー","しゃー","あおー"
  ];

  /* ---------------------------------------------------------
     鍵生成（パスワード → SHA-256 → AES用鍵）
  --------------------------------------------------------- */
  async function generateKey(password) {
    const pwBytes = encoder.encode(password || "");
    const hash = await crypto.subtle.digest("SHA-256", pwBytes);
    
    const aesKey = await crypto.subtle.importKey(
      "raw",
      hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return aesKey;
  }

  /* ---------------------------------------------------------
     AES-GCM 暗号化
     出力: [IV(12bytes)][暗号化データ]
  --------------------------------------------------------- */
  async function encryptBytes(bytes, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      bytes
    );
    
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    
    return result;
  }

  /* ---------------------------------------------------------
     AES-GCM 復号
     入力: [IV(12bytes)][暗号化データ]
  --------------------------------------------------------- */
  async function decryptBytes(bytes, key) {
    const iv = bytes.slice(0, 12);
    const encryptedData = bytes.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedData
    );
    
    return new Uint8Array(decrypted);
  }

  /* ---------------------------------------------------------
     バイト列 → にゃん語テキスト
     1バイト = 上位4bit語 + 下位4bit語
  --------------------------------------------------------- */
  function bytesToNyango(bytes) {
    const out = [];
    for (let b of bytes) {
      out.push(NYAN_TOKENS[(b >> 4) & 0x0f]);
      out.push(NYAN_TOKENS[b & 0x0f]);
    }
    return out.join(" ");
  }

  /* ---------------------------------------------------------
     にゃん語 → バイト列へ復元
  --------------------------------------------------------- */
  function nyangoToBytes(text) {
    const parts = text.trim().split(/\s+/);
    if (parts.length % 2 !== 0) {
      throw new Error("にゃん語の形式がおかしいよ");
    }

    const rev = new Map(NYAN_TOKENS.map((v, i) => [v, i]));
    const out = new Uint8Array(parts.length / 2);

    for (let i = 0; i < out.length; i++) {
      const hi = rev.get(parts[i * 2]);
      const lo = rev.get(parts[i * 2 + 1]);
      if (hi === undefined || lo === undefined) {
        throw new Error("未知のにゃん語が含まれてるよ");
      }
      out[i] = (hi << 4) | lo;
    }
    return out;
  }

  /* ---------------------------------------------------------
     Uint8Array をまとめて1つに結合
  --------------------------------------------------------- */
  function concatBytes(arrs) {
    const size = arrs.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;

    for (let a of arrs) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  /* ---------------------------------------------------------
     公開する関数
  --------------------------------------------------------- */
  return {
    generateKey,
    encryptBytes,
    decryptBytes,
    bytesToNyango,
    nyangoToBytes,
    concatBytes
  };

})();
// decode.js
// にゃんコーダーV2：デコード専用ロジック
// 前提：nyancoder-core.js が先に読み込まれていること
// NyancoderCore.{generateKey, xorBytes, nyangoToBytes} を使用

const DecodeCore = (() => {
  const decoder = new TextDecoder("utf-8");

  // ------- 小さいヘルパー群 -------

  function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readUint32LE(bytes, offset) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    );
  }

  // ------- コンテナをばらす処理 -------

  // plaintext:
  //   [ "NYAC"(4B) / version(1B) / flags(1B) / entryCount(2B) ]
  //   [entry1][entry2]...
  //
  // entry:
  //   [nameLen(2B)][name]
  //   [catLen(2B)][catName]
  //   [contentLen(4B)][contentBytes]
  function parseContainer(plaintext) {
    if (plaintext.length < 8) {
      throw new Error("データが短すぎてヘッダを読めない");
    }

    const magic = decoder.decode(plaintext.slice(0, 4));
    if (magic !== "NYAC") {
      throw new Error("NYAN形式ではないデータ");
    }

    const version    = plaintext[4];
    const flags      = plaintext[5];
    const entryCount = readUint16LE(plaintext, 6);

    let offset = 8;
    const entries = [];

    for (let i = 0; i < entryCount; i++) {
      // ファイル名
      if (offset + 2 > plaintext.length) {
        throw new Error("nameLen が範囲外");
      }
      const nameLen = readUint16LE(plaintext, offset);
      offset += 2;

      if (offset + nameLen > plaintext.length) {
        throw new Error("name が範囲外");
      }
      const name = decoder.decode(plaintext.slice(offset, offset + nameLen));
      offset += nameLen;

      // 猫の名前
      if (offset + 2 > plaintext.length) {
        throw new Error("catLen が範囲外");
      }
      const catLen = readUint16LE(plaintext, offset);
      offset += 2;

      if (offset + catLen > plaintext.length) {
        throw new Error("catName が範囲外");
      }
      const catName = decoder.decode(
        plaintext.slice(offset, offset + catLen)
      );
      offset += catLen;

      // 中身
      if (offset + 4 > plaintext.length) {
        throw new Error("contentLen が範囲外");
      }
      const contentLen = readUint32LE(plaintext, offset);
      offset += 4;

      if (offset + contentLen > plaintext.length) {
        throw new Error("content が範囲外");
      }
      const contentBytes = plaintext.slice(offset, offset + contentLen);
      offset += contentLen;

      entries.push({ name, catName, contentBytes });
    }

    return { version, flags, entryCount, entries };
  }

  // ------- JSON形式かどうか判定 -------
  function isJsonData(bytes) {
    // 先頭の空白をスキップして { で始まるかチェック
    for (let i = 0; i < bytes.length && i < 100; i++) {
      const char = bytes[i];
      // 空白文字（スペース、タブ、改行、CR）をスキップ
      if (char === 0x20 || char === 0x09 || char === 0x0A || char === 0x0D) {
        continue;
      }
      // { (0x7B) で始まればJSON
      return char === 0x7B;
    }
    return false;
  }

  // ------- JSON形式をパース -------
  function parseJsonData(plaintext) {
    const jsonStr = decoder.decode(plaintext);
    const data = JSON.parse(jsonStr);
    
    // JSONの場合は特別な戻り値形式
    return {
      version: 1,
      flags: 0,
      entryCount: 1,
      isJson: true,  // JSON形式フラグ
      jsonData: data,
      entries: [{
        name: 'data.json',
        catName: 'にゃん',
        contentBytes: plaintext
      }]
    };
  }

  // ------- デコード本体（UI非依存） -------
  // nyangoText: .nyan の中身（にゃん語テキスト全部）
  // password  : 文字列
  //
  // 戻り値:
  //   {
  //     version,
  //     flags,
  //     entryCount,
  //     entries: [
  //       { name, catName, contentBytes },
  //       ...
  //     ]
  //   }
  //   ※JSON形式の場合は isJson: true と jsonData が追加される
  async function runDecode(nyangoText, password) {
    if (!nyangoText || !nyangoText.trim()) {
      throw new Error("にゃん語テキストが空");
    }

    // にゃん語 → 暗号バイト列
    const encryptedBytes = NyancoderCore.nyangoToBytes(nyangoText);

    // パスワードから鍵生成 → AES-GCMで平文に
    const key       = await NyancoderCore.generateKey(password);
    const plaintext = await NyancoderCore.decryptBytes(encryptedBytes, key);

    // データ形式を判定してパース
    if (isJsonData(plaintext)) {
      // JSON形式（nyan-lockerバックアップなど）
      return parseJsonData(plaintext);
    } else {
      // NYACコンテナ形式（従来のnyan-coder）
      return parseContainer(plaintext);
    }
  }

  // ------- ファイルからデコード（.zipと.nyan両対応） -------
  // file: File オブジェクト（.zip または .nyan）
  // password: 文字列
  async function runDecodeFromFile(file, password) {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.zip')) {
      // zipファイルの場合：解凍して.nyanを探す
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      // .nyanファイルを探す
      let nyanFile = null;
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (path.toLowerCase().endsWith('.nyan') && !zipEntry.dir) {
          nyanFile = zipEntry;
          break;
        }
      }
      
      if (!nyanFile) {
        throw new Error('zipファイルの中に.nyanファイルが見つからないよ 😿');
      }
      
      // .nyanファイルの中身を取得
      const nyangoText = await nyanFile.async('text');
      return await runDecode(nyangoText, password);
      
    } else if (fileName.endsWith('.nyan')) {
      // .nyanファイルの場合：そのまま読む
      const nyangoText = await file.text();
      return await runDecode(nyangoText, password);
      
    } else {
      throw new Error('このファイルは対応してないよ。.zipか.nyanファイルを選んでね 😿');
    }
  }

  // 外から使うのはこれだけ
  return {
    runDecode,
    runDecodeFromFile,
  };
})();
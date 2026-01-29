// encode.js
// にゃんコーダーV2：エンコード専用ロジック
// 前提：nyancoder-core.js が先に読み込まれていて
// NyancoderCore.{generateKey, xorBytes, bytesToNyango, concatBytes} が使える

const EncodeCore = (() => {
  const encoder = new TextEncoder();

  // ------- 小さいヘルパー群 -------

  function writeUint16LE(value) {
    const b = new Uint8Array(2);
    b[0] = value & 0xff;
    b[1] = (value >> 8) & 0xff;
    return b;
  }

  function writeUint32LE(value) {
    const b = new Uint8Array(4);
    b[0] = value & 0xff;
    b[1] = (value >> 8) & 0xff;
    b[2] = (value >> 16) & 0xff;
    b[3] = (value >> 24) & 0xff;
    return b;
  }

  // 任意ファイルをバイト列に
  async function readFileAsBytes(file) {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ------- コンテナフォーマット -------

  // ヘッダ（単純版）
  // [ "NYAC"(4B) / version(1B) / flags(1B) / entryCount(2B) ]
  function buildHeader(entryCount) {
    const magic   = encoder.encode("NYAC");   // 4
    const version = new Uint8Array([0x01]);   // 1
    const flags   = new Uint8Array([0x00]);   // 1（今は未使用）
    const ec      = writeUint16LE(entryCount); // 2

    return NyancoderCore.concatBytes([magic, version, flags, ec]);
  }

  // エントリ
  // [nameLen(2B)][name]
  // [catLen(2B)][catName]
  // [contentLen(4B)][contentBytes]
  function buildEntry(originalName, catName, contentBytes) {
    const onBytes = encoder.encode(originalName);
    const cnBytes = encoder.encode(catName);

    return NyancoderCore.concatBytes([
      writeUint16LE(onBytes.length),
      onBytes,
      writeUint16LE(cnBytes.length),
      cnBytes,
      writeUint32LE(contentBytes.length),
      contentBytes,
    ]);
  }

  // お遊び用：猫の名前（固定でも可）
  function randomCatName() {
    const list = ["ミケ", "クロ", "トラ", "タマ", "ルナ", "ナツ", "ハナ"];
    return list[Math.floor(Math.random() * list.length)];
  }

  // ファイル名用のランダム猫名（保護用）
  function randomProtectionCatName() {
    const list = [
      'ミケ', 'トラ', 'クロ', 'シロ', 'タマ',
      'サバ', 'ハチ', 'サビ', 'キジ', 'ブチ',
      'チャ', 'アメ', 'ソラ', 'モモ', 'コテツ'
    ];
    return list[Math.floor(Math.random() * list.length)];
  }

  // ファイル名生成（カスタム名 or ランダム猫名）
  function generateFilename(customName = '') {
    const now = new Date();
    const year = String(now.getFullYear()).slice(2); // 25
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 12
    const day = String(now.getDate()).padStart(2, '0'); // 24
    const date = year + month + day; // 251224
    const hour = now.getHours() + '時頃'; // 7時頃

    let filename;
    if (customName && customName.trim()) {
      // カスタム名が入力されている場合：日付・時間なし
      filename = customName.trim() + '.nyan';
    } else {
      // 空欄の場合：ランダム猫名_保護_日付_時間
      const catName = randomProtectionCatName();
      filename = `${catName}_保護_${date}_${hour}.nyan`;
    }

    return filename;
  }

  // ------- エンコード本体（UI非依存） -------
  // files: FileList または File[]（フォルダ選択もそのまま渡せばOK）
  // password: 文字列
  // customFilename: カスタムファイル名（空欄ならランダム）
  // 戻り値: { filename: "ミケ_保護_251224_7時頃.zip", blob: Blobオブジェクト }
  async function runEncode(files, password, customFilename = '') {
    if (!files || files.length === 0) {
      throw new Error("エンコード対象のファイルがありません");
    }

    const entries = [];

    // FileList でも配列でもどちらでも回せるようにする
    for (const file of files) {
      const contentBytes = await readFileAsBytes(file);
      const catName = randomCatName(); // 将来UIから渡してもOK
      
      // フォルダ構造を保持：webkitRelativePathがあればそれを使う、なければfile.name
      const filePath = file.webkitRelativePath || file.name;
      
      const entry = buildEntry(filePath, catName, contentBytes);
      entries.push(entry);
    }

    // [ヘッダ][エントリ1][エントリ2]...
    const header    = buildHeader(entries.length);
    const plaintext = NyancoderCore.concatBytes([header, ...entries]);

    // 暗号化：password → AES-256-GCM → にゃん語
    const key       = await NyancoderCore.generateKey(password);
    const encrypted = await NyancoderCore.encryptBytes(plaintext, key);
    const nyango    = NyancoderCore.bytesToNyango(encrypted);

    // 出力ファイル名生成
    const nyanFilename = generateFilename(customFilename);

    // .nyanファイルをBlobとして作成（直接ダウンロード）
    const nyanBlob = new Blob([nyango], { type: 'text/plain' });

    return {
      filename: nyanFilename,
      blob: nyanBlob,
    };
  }

  // 外から使うのはこれだけ
  return {
    runEncode,
  };
})();
/**
 * ShikakuMenu - ゲートキーパー（UI状態管理・データ仲介）
 */
const ShikakuMenu = {
    init() {
        this.btnNewGame = document.getElementById('btn-new-game');
        this.btnHint = document.getElementById('btn-hint');
        this.btnClear = document.getElementById('btn-clear-rects');
        this.difficultySelect = document.getElementById('difficulty-select');
        
        this.modal = document.getElementById('confirm-modal');
        this.modalYes = document.getElementById('modal-confirm-yes');
        this.modalNo = document.getElementById('modal-confirm-no');

        this.bindEvents();
    },

    bindEvents() {
        // 新規ゲームボタン押下時
        this.btnNewGame.addEventListener('click', () => {
            // localStorage に進行中のデータがあるか確認
            if (localStorage.getItem('shikaku_progress')) {
                // 上書き確認ダイアログを表示（うっかりミス防止）
                this.modal.style.display = 'flex';
            } else {
                this.startNewGameFlow();
            }
        });

        // モーダル内のボタン処理
        this.modalYes.addEventListener('click', () => {
            this.modal.style.display = 'none';
            this.startNewGameFlow();
        });

        this.modalNo.addEventListener('click', () => {
            this.modal.style.display = 'none';
        });

        // ヒントボタン
        this.btnHint.addEventListener('click', () => {
            if (window.ShikakuCore) {
                window.ShikakuCore.triggerHint();
            }
        });

        // クリアボタン
        this.btnClear.addEventListener('click', () => {
            if (window.ShikakuCore && confirm('現在の解答をすべて消去しますか？')) {
                window.ShikakuCore.clearRects();
            }
        });
    },

    startNewGameFlow() {
        const difficulty = this.difficultySelect.value;
        // 既存の途中データを破棄
        localStorage.removeItem('shikaku_progress');
        
        // Coreへの新規問題生成命令
        if (window.ShikakuCore) {
            window.ShikakuCore.startNewGame(difficulty);
        }
    },

    /**
     * Firebase Firestore への実績データ送信（モックインターフェース）
     */
    sendClearRecordToFirestore(record) {
        console.log('--- Firestoreへのクリア実績送信 ---', record);
        /* // 実際のFirebase送信コードのイメージ:
        db.collection('scores').add({
            puzzle: 'shikaku',
            difficulty: record.difficulty,
            time: record.time,
            clearedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        */
    }
};

// DOM読み込み完了時に初期化
document.addEventListener('DOMContentLoaded', () => ShikakuMenu.init());

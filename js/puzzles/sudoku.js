import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
// 📑 Firebase Firestoreに必要な関数を追加
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, arrayUnion, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { analyzeSudoku } from "../utils/sudokuSolver.js";
// 📑 自動生成エンジンのインポート
import { generatePuzzle } from "../utils/sudokuGenerator.js";

const firebaseConfig = {
  apiKey: "AIzaSyCkbdX-B6FfIVplmG98tIvxO0uUv-mYDSw",
  authDomain: "yourlogic-c0b64.firebaseapp.com",
  projectId: "yourlogic-c0b64",
  storageBucket: "yourlogic-c0b64.firebasestorage.app",
  messagingSenderId: "774656497074",
  appId: "1:774656497074:web:07d6d6092d5d176224c0ab",
  measurementId: "G-W4VM6FC3J5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let selectedCell = null;
let currentDifficulty = 'easy';
let isMemoMode = false;
let currentInputMode = 'location'; 
let selectedNumber = null;         

let currentSolution = "";
// 📑 現在プレイ中のパズルのFirestoreドキュメントIDを保持する変数
let currentPuzzleId = null;

const statusText = document.getElementById('auth-status-text');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const memoBtn = document.getElementById('memo-btn');
const modeLocationBtn = document.getElementById('mode-location-btn');
const modeAutoBtn = document.getElementById('mode-auto-btn');

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        statusText.innerText = `ログイン中: ${user.displayName}`;
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        
        // 📑 ログイン時、usersコレクションにユーザー専用ドキュメントがなければ作成
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
            await setDoc(userDocRef, {
                lastGeneratedAt: null,
                clearedPuzzles: []
            });
        }
    } else {
        statusText.innerText = "ゲストモード（問題の新規自動生成はできません）";
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
    // 初回ロード
    loadOrGeneratePuzzle();
});

loginBtn.addEventListener('click', () => signInWithPopup(auth, provider).catch(err => alert("ログイン失敗")));
logoutBtn.addEventListener('click', () => signOut(auth));

// --- (中略：盤面生成・ハイライト・入力ロジック・キーボードイベント・updateNumberPadStatus は前回と同じ) ---
// ※コード量削減のため、ロジック自体に変更がない描画系イベント群は省略していますが、そのまま残してください。

// 難易度ボタンのイベント
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentDifficulty = e.target.dataset.diff;
        loadOrGeneratePuzzle();
    });
});

// 📑 【大幅修正】オンデマンド問題ロード ＆ 生成システム
async function loadOrGeneratePuzzle() {
    console.log(`難易度「${currentDifficulty}」の処理を開始します...`);
    currentPuzzleId = null; // 初期化

    try {
        // 1. まず、ストレージ(Firestore)から該当難易度の問題を全件(または多めに)取得
        const q = query(
            collection(db, "puzzles"),
            where("type", "==", "sudoku"),
            where("difficulty", "==", currentDifficulty)
        );
        const querySnapshot = await getDocs(q);
        
        let availablePuzzles = [];
        querySnapshot.forEach((doc) => {
            availablePuzzles.push({ id: doc.id, ...doc.data() });
        });

        let targetPuzzle = null;

        if (currentUser) {
            // 【ユーザーの場合】
            // ユーザーデータを取得して、クリア済みの問題IDリストを確認
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            const clearedPuzzles = userDoc.data()?.clearedPuzzles || [];

            // ストレージにある問題の中から、まだクリアしていないものを1つ探す
            targetPuzzle = availablePuzzles.find(p => !clearedPuzzles.includes(p.id));

            // 未クリアの問題がストレージに1つもなかった場合 ➡️ 問題を新規生成する
            if (!targetPuzzle) {
                console.log("未プレイの問題がありません。新規生成を試みます...");
                
                // 24時間コスト（制限）チェック
                const lastGeneratedAt = userDoc.data()?.lastGeneratedAt;
                const now = new Date();

                if (lastGeneratedAt) {
                    const lastGenTime = lastGeneratedAt.toDate();
                    const diffMs = now - lastGenTime;
                    const diffHours = diffMs / (1000 * 60 * 60);

                    if (diffHours < 24) {
                        const remainHours = Math.ceil(24 - diffHours);
                        alert(`⚠️ この難易度のストックが切れています。\nあなたが新しく問題を生成できるようになるまで、あと約 ${remainHours} 時間必要です。`);
                        return;
                    }
                }

                // コストクリア、または初回生成なので、問題生成エンジンを起動
                statusText.innerText = "⏳ 唯一解パズルを自動生成中...";
                let newPuzzle = generatePuzzle(currentDifficulty);
                
                // ガチャが外れた場合の保険リトライ
                let retry = 0;
                while (!newPuzzle && retry < 3) {
                    newPuzzle = generatePuzzle(currentDifficulty);
                    retry++;
                }

                if (newPuzzle) {
                    // 生成された問題をストレージ(puzzles)に保存
                    const docRef = await addDoc(collection(db, "puzzles"), {
                        type: "sudoku",
                        difficulty: currentDifficulty,
                        problemData: newPuzzle.problemData,
                        solutionData: newPuzzle.solutionData,
                        createdAt: serverTimestamp()
                    });

                    // ユーザーの生成猶予時間（タイムスタンプ）を現在の時刻に更新
                    await updateDoc(doc(db, "users", currentUser.uid), {
                        lastGeneratedAt: serverTimestamp()
                    });

                    targetPuzzle = { id: docRef.id, ...newPuzzle };
                    alert("🎉 あなたの生成コストを消費して、新しい問題を作成しストレージに補充しました！");
                } else {
                    alert("問題の生成に失敗しました。もう一度お試しください。");
                    statusText.innerText = `ログイン中: ${currentUser.displayName}`;
                    return;
                }
            }
        } else {
            // 【ゲストの場合】
            // クリア履歴が追えないため、単にストレージにある既存パズルからランダムに1つ選択
            if (availablePuzzles.length > 0) {
                const randIndex = Math.floor(Math.random() * availablePuzzles.length);
                targetPuzzle = availablePuzzles[randIndex];
            } else {
                alert(`⚠️ 現在、難易度「${currentDifficulty}」の既存ストックがありません。\nログインすると新しい問題を生成して遊ぶことができます！`);
                return;
            }
        }

        // パズルの描画
        if (targetPuzzle) {
            currentPuzzleId = targetPuzzle.id; // 現在のパズルIDを記憶
            displayPuzzle(targetPuzzle.problemData, targetPuzzle.solutionData);
            if (currentUser) {
                statusText.innerText = `ログイン中: ${currentUser.displayName} (パズルID: ${currentPuzzleId})`;
            }
        }

    } catch (error) {
        console.error("データ処理エラー:", error);
        alert("エラー内容: " + error.message); 
    }
}

// 盤面描画の補助関数
function displayPuzzle(boardStr, solutionStr) {
    updateHighlight(null);
    currentSolution = solutionStr; // ストレージに保存されている模範解答をそのままセット

    for (let i = 0; i < 81; i++) {
        const char = boardStr[i];
        cells[i].className = 'cell';
        const cellVal = cells[i].querySelector('.cell-val');
        const memoGrid = cells[i].querySelector('.memo-grid');
        memoGrid.querySelectorAll('span').forEach(span => span.innerText = '');
        
        if (char !== '0') {
            cellVal.innerText = char;
            cells[i].classList.add('initial');
        } else {
            cellVal.innerText = '';
        }
    }
    updateNumberPadStatus();
}

// 📑 答え合わせ処理（正解した時のクリア履歴追加を実装）
async function executeCheck(isAuto = false) {
    const currentBoardStr = cells.map(cell => cell.querySelector('.cell-val').innerText.trim() || '0').join('');
    
    if (!isAuto && currentBoardStr.includes('0')) {
        alert("⚠️ まだ空いているマスがあります！すべて埋めてから答え合わせをしてください。");
        return;
    }

    if (currentBoardStr === currentSolution) {
        alert("🎉 おめでとうございます！正解です！！");
        
        // 📑 ログインユーザーが正解した場合、このパズルIDをクリア済みリストに即時追加
        if (currentUser && currentPuzzleId) {
            try {
                await updateDoc(doc(db, "users", currentUser.uid), {
                    clearedPuzzles: arrayUnion(currentPuzzleId)
                });
                console.log(`クリア実績を保存しました (PuzzleID: ${currentPuzzleId})`);
            } catch (e) {
                console.error("クリア実績の保存に失敗:", e);
            }
        }
    } else {
        alert("❌ 残念！どこかが間違っています。もう一度見著してみましょう。");
    }
}

// 答え合わせ・ヒント・諦めるのイベント処理は前回と同様なので、そのまま引き継ぎ
document.getElementById('check-btn').addEventListener('click', () => executeCheck(false));
// ... (hint-btn, giveup-btn のクリックイベント)

import { auth, db } from './firebase.js';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { ref, get, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { questionPoints } from './scoring.js';
import { studentKey, normalizeStudentId, displayId } from './keys.js';
import { $, show, esc, LABELS, choiceButtonsHtml } from './ui.js';

const S = { uid: null, pin: null, sk: null, name: null, offset: 0, meta: null, current: null, timer: null, joined: false };
const r = (p) => ref(db, `rooms/${S.pin}/${p}`);
const serverNow = () => Date.now() + S.offset;

onValue(ref(db, '.info/serverTimeOffset'), (s) => { S.offset = s.val() || 0; });
onValue(ref(db, '.info/connected'), (s) => {
  $('#conn').textContent = s.val() ? '' : '網路中斷，正在重新連線…';
  if (s.val() && S.joined) markPresent();
});

signInAnonymously(auth).catch((e) => { $('#conn').textContent = '無法連線：' + e.message; });

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  S.uid = user.uid;
  const pin = new URLSearchParams(location.search).get('pin');
  if (pin) await choosePin(pin); else show('s-pin');
});

$('#btn-pin').onclick = () => choosePin($('#pin').value.trim());
async function choosePin(pin) {
  $('#pin-err').textContent = '';
  if (!/^\d{6}$/.test(pin)) { show('s-pin'); $('#pin-err').textContent = '場次碼是 6 位數字'; return; }
  const meta = (await get(ref(db, `rooms/${pin}/meta`))).val();
  if (!meta) { show('s-pin'); $('#pin-err').textContent = '找不到這個場次'; return; }
  if (meta.status === 'final') { show('s-pin'); $('#pin-err').textContent = '這個場次已經結束'; return; }
  S.pin = pin;
  const me = (await get(r(`players/${S.uid}`))).val();
  if (me) { S.sk = me.studentId; S.name = me.name; return enterGame(); }
  show('s-id');
}

$('#btn-sid').onclick = async () => {
  $('#sid-err').textContent = '';
  const id = normalizeStudentId($('#sid').value);
  if (!id) { $('#sid-err').textContent = '請輸入學號'; return; }
  const sk = studentKey(id);
  const row = (await get(ref(db, `roster/${sk}`))).val();
  if (!row) { $('#sid-err').textContent = '查無此學號，請確認或洽老師'; return; }
  S.sk = sk; S.name = row.name;
  $('#confirm-name').textContent = row.name;
  show('s-confirm');
};
$('#btn-no').onclick = () => { $('#sid').value = ''; show('s-id'); };
$('#btn-yes').onclick = async () => {
  $('#confirm-err').textContent = '';
  const claimRef = r(`claims/${S.sk}`);
  const owner = (await get(claimRef)).val();
  try {
    if (owner && owner !== S.uid) throw new Error('taken');
    if (!owner) await set(claimRef, S.uid);
    await set(r(`players/${S.uid}`), { studentId: S.sk, name: S.name, joinedAt: serverTimestamp() });
    enterGame();
  } catch (e) {
    $('#confirm-err').textContent = e.message === 'taken' || String(e.code).includes('PERMISSION')
      ? '此學號已在其他裝置登入。若是你換了手機，請請老師「解除綁定」後再試。'
      : '進場失敗：' + e.message;
  }
};

function markPresent() {
  const pr = r(`presence/${S.uid}`);
  onDisconnect(pr).remove();
  set(pr, true);
}

function enterGame() {
  S.joined = true;
  markPresent();
  $('#me-line').textContent = `${displayId(S.sk)} ${S.name}`;
  onValue(r('meta'), (s) => { S.meta = s.val(); route(); });
  onValue(r('current'), (s) => { S.current = s.val(); route(); });
}

async function route() {
  const m = S.meta; if (!m) return;
  clearInterval(S.timer);
  if (m.status === 'lobby') { $('#wait-msg').textContent = '已進場，等待老師開始…'; return show('s-wait'); }
  if (m.status === 'question' && S.current && S.current.qIndex === m.qIndex) return renderQuestion();
  if (m.status === 'reveal') return renderReveal();
  if (m.status === 'leaderboard' || m.status === 'final') return renderRank(m.status === 'final');
}

async function renderQuestion() {
  const c = S.current;
  $('#p-q').textContent = `第 ${c.qIndex + 1} 題：${c.text}`;
  const mine = (await get(r(`answers/${c.qKey}/${S.uid}`))).val();
  $('#p-choices').innerHTML = choiceButtonsHtml(c.options, { disabled: !!mine });
  $('#p-status').textContent = mine ? `已作答 ${LABELS[mine.choice]}，等待公布` : '';
  if (mine) $(`#p-choices .choice[data-i="${mine.choice}"]`).classList.add('picked');
  $('#p-choices').querySelectorAll('.choice').forEach((b) => (b.onclick = () => answer(Number(b.dataset.i))));
  const end = c.startAt + c.timeLimit * 1000;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - serverNow()) / 1000));
    $('#p-timer').textContent = left;
    if (left === 0) { clearInterval(S.timer); $('#p-choices').querySelectorAll('.choice').forEach((b) => (b.disabled = true)); }
  };
  tick(); S.timer = setInterval(tick, 200);
  show('s-question');
}

async function answer(i) {
  const c = S.current;
  $('#p-choices').querySelectorAll('.choice').forEach((b) => (b.disabled = true));
  try {
    await set(r(`answers/${c.qKey}/${S.uid}`), { choice: i, at: serverTimestamp() });
    $(`#p-choices .choice[data-i="${i}"]`).classList.add('picked');
    $('#p-status').textContent = `已作答 ${LABELS[i]}，等待公布`;
  } catch {
    $('#p-status').textContent = '時間到，未計分';
  }
}

async function renderReveal() {
  const key = 'q' + S.meta.qIndex;
  const rv = (await get(r(`reveal/${key}`))).val();
  if (!rv) return;
  const mine = (await get(r(`answers/${key}/${S.uid}`))).val();
  const correct = !!mine && mine.choice === rv.answer;
  const pts = mine ? questionPoints(correct, mine.at - rv.startAt, rv.timeLimit) : 0;
  $('#r-title').textContent = !mine ? '未作答' : correct ? '答對了！' : '答錯了';
  $('#r-detail').innerHTML = `正確答案：<b>${LABELS[rv.answer]}</b>${mine ? `　你的答案：${LABELS[mine.choice]}` : ''}　本題得分：${pts}`;
  $('#r-expl').textContent = rv.explanation || '';
  $('#r-rank').textContent = '';
  show('s-result');
}

async function renderRank(final) {
  const sc = (await get(r(`scores/${S.sk}`))).val();
  $('#r-title').textContent = final ? '測驗結束' : '目前排名';
  $('#r-detail').innerHTML = sc ? `第 <b>${sc.rank}</b> 名　總分 ${sc.total}　答對 ${sc.correct} 題` : '尚無成績';
  $('#r-expl').textContent = '';
  $('#r-rank').textContent = final ? '請看大螢幕的排行榜' : '等待下一題…';
  show('s-result');
}

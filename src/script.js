/* Firebase + Firestore integration */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, orderBy, limit, startAfter, getCountFromServer, documentId, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ---------- CONFIG ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyAIGu_5QNMvzrObPNxHdG9kybBQtAddGsw",
  authDomain: "linkrutgon-a69c8.firebaseapp.com",
  projectId: "linkrutgon-a69c8",
  storageBucket: "linkrutgon-a69c8.firebasestorage.app",
  messagingSenderId: "373927357726",
  appId: "1:373927357726:web:2a155c5ca9ee7066a62d0f",
  measurementId: "G-CFQC07GBVE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();

/* ---------- App State ---------- */
let data = []; // Sẽ chỉ chứa dữ liệu của trang hiện tại
const PER_PAGE = 10;
let page = 1;
let importedFileNames = [];
let pendingDeleteIndex = null;
let currentUser = null;
let totalLinks = 0; // Biến mới để lưu tổng số link
let pageCursors = { 1: null }; // Biến mới để lưu con trỏ cho mỗi trang

/* ---------- DOM Elements ---------- */
const loginContainer = document.getElementById('login-container');
const mainContainer = document.getElementById('main-container');
const loginErrorEl = document.getElementById('loginError');
const loaderContainer = document.getElementById('loader-container');

/* ---------- UI helpers ---------- */
function copyWithIcon(text, btnEl) {
  navigator.clipboard.writeText(text).then(()=>{ const icon = btnEl.querySelector('i'); const oldClass = icon.className; icon.className = 'fa fa-check'; setTimeout(()=>{ icon.className = oldClass; }, 1200); }).catch(()=>{});
}

function render() {
  document.getElementById('infoLine').textContent = `Tổng link hiện có: ${totalLinks}`;
  
  const pageItems = data;

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = "";

  // PHẦN BỊ THIẾU TRƯỚC ĐÂY GIỜ ĐÃ ĐƯỢC THÊM ĐẦY ĐỦ
  pageItems.forEach((item, idx) => {
    const realIndex = (page - 1) * PER_PAGE + idx;
    const tr = document.createElement('tr');

    // --- Ô rút gọn ---
    const tdShort = document.createElement('td');
    const shortWrapper = document.createElement('div');
    shortWrapper.className = 'cell-content-wrapper';
    
    const copyBtnShort = document.createElement('button');
    copyBtnShort.className = 'copy-btn';
    copyBtnShort.title = 'Copy full short URL';
    copyBtnShort.innerHTML = '<i class="fa fa-copy"></i>';
    copyBtnShort.onclick = ()=> copyWithIcon(location.origin + '/' + item.short, copyBtnShort);
    
    const shortLink = document.createElement('a');
    shortLink.href = location.origin + '/' + item.short;
    shortLink.target = '_blank';
    shortLink.className = 'link-text link-short';
    shortLink.textContent = item.short;
    
    shortWrapper.appendChild(copyBtnShort);
    shortWrapper.appendChild(shortLink);
    tdShort.appendChild(shortWrapper);

    const tdClicks = document.createElement('td');
    tdClicks.textContent = item.clicks || 0;

    // --- Ô Tiêu đề ---
    const tdTitle = document.createElement('td');
    tdTitle.textContent = item.title || '';
    tdTitle.className = 'title-text';
    tdTitle.title = item.title || '';

    // --- Ô link gốc ---
    const tdOrig = document.createElement('td');
    const origWrapper = document.createElement('div');
    origWrapper.className = 'cell-content-wrapper';

    const copyBtnOrig = document.createElement('button');
    copyBtnOrig.className = 'copy-btn';
    copyBtnOrig.title = 'Copy original URL';
    copyBtnOrig.innerHTML = '<i class="fa fa-copy"></i>';
    copyBtnOrig.onclick = ()=> copyWithIcon(item.original, copyBtnOrig);

    const origLink = document.createElement('a');
    origLink.href = item.original;
    origLink.target = 'blank';
    origLink.className = 'link-text';
    origLink.textContent = item.original;
    origLink.title = item.original;

    origWrapper.appendChild(copyBtnOrig);
    origWrapper.appendChild(origLink);
    tdOrig.appendChild(origWrapper);

    // --- Ô hành động ---
    const tdAct = document.createElement('td');
    tdAct.style.textAlign = 'right';

    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn action-edit';
    editBtn.title = 'Sửa';
    editBtn.innerHTML = '<i class="fa fa-edit"></i>';
    editBtn.onclick = ()=> startEdit(idx, tr);
    editBtn.style.marginRight = '8px';

    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn action-del';
    delBtn.title = 'Xóa';
    delBtn.innerHTML = '<i class="fa fa-trash"></i>';
    delBtn.onclick = ()=> showConfirm(idx);

    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);

    tr.appendChild(tdShort);
    tr.appendChild(tdClicks);
    tr.appendChild(tdTitle);
    tr.appendChild(tdOrig);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });

  // Phần tạo nút phân trang
  const pgWrap = document.getElementById('pagination');
  pgWrap.innerHTML = "";
  const totalPg = Math.max(1, Math.ceil(totalLinks / PER_PAGE));

  for (let p = 1; p <= totalPg; p++) {
    const b = document.createElement('button');
    b.className = 'pg-btn' + (p === page ? ' active' : '');
    b.textContent = p;
    b.onclick = () => { loadLinks(p); };
    pgWrap.appendChild(b);
  }

  document.getElementById('dataTextarea').value = "// Dữ liệu JSON toàn bộ không còn khả dụng ở chế độ xem này.";
}

function startEdit(i, rowEl){
  const item = data[i];
  
  const tdShort = document.createElement('td');
  const shortInput = document.createElement('input');
  shortInput.className = 'table-edit-input';
  shortInput.value = item.short;
  tdShort.appendChild(shortInput);

  const tdTitle = document.createElement('td');
  const titleInput = document.createElement('input');
  titleInput.className = 'table-edit-input';
  titleInput.value = item.title || '';
  tdTitle.appendChild(titleInput);
  
  const tdOrig = document.createElement('td');
  const origInput = document.createElement('input');
  origInput.className = 'table-edit-input';
  origInput.value = item.original;
  tdOrig.appendChild(origInput);

  const tdClicks = document.createElement('td');
  tdClicks.textContent = item.clicks || 0;

  const tdAct = document.createElement('td');
  tdAct.style.textAlign = 'right';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'action-btn action-save';
  saveBtn.title = 'Lưu';
  saveBtn.innerHTML = '<i class="fa fa-check"></i>';
  saveBtn.style.marginRight = '8px';
  saveBtn.onclick = async ()=> {
    const ns = shortInput.value.trim();
    const no = origInput.value.trim();
    const nt = titleInput.value.trim();
    if(!ns || !no) return;
    const oldShort = item.short;
    const payload = { 
      original: no, 
      title: nt,
      clicks: item.clicks || 0 
    };

    try {
      if (ns !== oldShort) {
        const existing = await getDoc(doc(db, "links", ns));
        if (existing.exists()) {
          return alert("Mã rút gọn mới đã tồn tại. Chọn mã khác.");
        }
        await setDoc(doc(db, "links", ns), payload);
        await deleteDoc(doc(db, "links", oldShort));
        data[i] = { short: ns, original: no, title: nt, clicks: item.clicks || 0 };
      } else {
        await updateDoc(doc(db, "links", ns), payload);
        data[i].original = no;
        data[i].title = nt;
      }
      render();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu: " + err.message);
      render();
    }
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'action-btn action-del';
  cancelBtn.title = 'Hủy';
  cancelBtn.innerHTML = '<i class="fa fa-times"></i>';
  cancelBtn.onclick = ()=> render();

  tdAct.appendChild(saveBtn);
  tdAct.appendChild(cancelBtn);

  rowEl.innerHTML = '';
  rowEl.appendChild(tdShort);
  rowEl.appendChild(tdClicks);
  rowEl.appendChild(tdTitle);
  rowEl.appendChild(tdOrig);
  rowEl.appendChild(tdAct);
  shortInput.focus();
}

async function createNew(){
  if (!currentUser) return alert("Vui lòng đăng nhập admin để tạo link.");

  const orig = document.getElementById('originalInput').value.trim();
  const customAlias = document.getElementById('customAliasInput').value.trim();
  const title = document.getElementById('titleInput').value.trim();
  
  if (!orig) {
      alert("Vui lòng nhập link gốc.");
      return;
  }

  const createBtn = document.getElementById('createBtn');
  createBtn.disabled = true;

  let code = customAlias;

  if (code) {
    if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
        alert("Mã tùy chỉnh chỉ được chứa chữ cái (a-z, A-Z), số (0-9), dấu gạch ngang (-) và gạch dưới (_).");
        createBtn.disabled = false;
        return;
    }
    const snap = await getDoc(doc(db, "links", code));
    if (snap.exists()) {
      alert("Mã rút gọn này đã tồn tại. Vui lòng chọn mã khác.");
      createBtn.disabled = false;
      return;
    }
  } 
  else {
    let codeFound = false;
    for (let length = 3; length <= 8; length++) {
        let tries = 0;
        const maxTriesPerLength = 15; 
        do {
            code = genCode(length);
            const snap = await getDoc(doc(db, "links", code));
            if (!snap.exists()) {
                codeFound = true;
                break;
            }
            tries++;
        } while (tries < maxTriesPerLength);

        if (codeFound) {
            break;
        }
    }

    if (!codeFound) {
        alert("Không thể tạo mã ngẫu nhiên duy nhất sau khi đã thử độ dài từ 3 đến 8. Vui lòng thử lại.");
        createBtn.disabled = false;
        return;
    }
  }
  try {
    const payload = { original: orig, clicks: 0 };
    if (title) {
        payload.title = title;
    }
    await setDoc(doc(db, "links", code), payload);
    
    const newUrl = `${location.origin}/${code}`;
    navigator.clipboard.writeText(newUrl).then(() => {
        const btnText = createBtn.querySelector('.btn-text');
        const originalText = btnText.textContent;
        const originalIcon = createBtn.querySelector('.btn-icon').outerHTML;

        btnText.textContent = 'Đã sao chép!';
        createBtn.querySelector('.btn-icon').outerHTML = '<i class="fa fa-check"></i>';
        
        setTimeout(() => {
          btnText.textContent = originalText;
          createBtn.querySelector('i').outerHTML = originalIcon;
          createBtn.disabled = false;
        }, 900);
    }).catch(err => {
        console.error('Failed to copy link: ', err);
        createBtn.disabled = false;
    });
    
    data.unshift({ short: code, original: orig, title: title, clicks: 0 }); 
    document.getElementById('originalInput').value = '';
    document.getElementById('customAliasInput').value = '';
    document.getElementById('titleInput').value = '';
    page = 1; 
    render();
  } catch (err) {
    console.error(err);
    alert("Lỗi tạo link: " + err.message);
    createBtn.disabled = false;
  }
}

function genCode(length = 8){
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for(let i=0; i<length; i++) { out += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return out;
}
/* ---------- Export ---------- */
async function exportFile(){
  const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
  if (!data.length) {
    alert('Không có dữ liệu để xuất');
    return;
  }

  const filesToDownload = [];
  let temp = [];
  let partIdx = 1;

  for (const it of data) {
    temp.push(it);
    const blob = new Blob([JSON.stringify(temp, null, 2)], { type: 'application/json' });

    if (blob.size > MAX_FILE_BYTES) {
      temp.pop();
      if (temp.length) {
        filesToDownload.push({ name: `part${partIdx}.json`, content: JSON.stringify(temp, null, 2) });
        partIdx++;
      }
      temp = [it];
    }
  }

  if (temp.length) {
    filesToDownload.push({ name: `part${partIdx}.json`, content: JSON.stringify(temp, null, 2) });
  }

  for (const f of filesToDownload) {
    const blob = new Blob([f.content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data/${f.name}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (importedFileNames.length) {
    document.getElementById('deleteCandidates').textContent = 'Gợi ý xóa (tên file đã nhập, nên xóa khỏi repo nếu đã gộp):\n' + importedFileNames.join('\n');
  }
  alert('Hoàn thành.');
}

function importSelectedFiles(files){
  if(!files || !files.length) return;
  importedFileNames = importedFileNames.concat(Array.from(files).map(f=>f.name));
  const readers = [];
  for(const f of files){
    readers.push(new Promise((res)=>{
      const r = new FileReader();
      r.onload = async (ev)=>{
        try{
          const arr = JSON.parse(ev.target.result);
          if(Array.isArray(arr)){
            const batch = writeBatch(db);
            arr.forEach(it=>{
              if(!it || !it.short) return;
              const id = String(it.short);
              const payload = {
                  original: String(it.original),
                  clicks: Number(it.clicks) || 0
              };
              if (it.title) {
                  payload.title = String(it.title);
              }
              batch.set(doc(db, "links", id), payload);
            });
            await batch.commit();
          }
        }catch(e){}
        res();
      };
      r.readAsText(f);
    }));
  }
  Promise.all(readers).then(()=>{ page=1; loadLinks(); document.getElementById('fileName').textContent = `Đã nhập ${files.length} file`; document.getElementById('importedFilesList').textContent = 'Các file đã nhập: ' + importedFileNames.join(', '); });
}

document.getElementById('saveDataBtn').onclick = async function(){
  if (!currentUser) return alert("Vui lòng đăng nhập admin trước khi lưu dữ liệu!");
  try{
    const arr = JSON.parse(document.getElementById('dataTextarea').value);
    if(!Array.isArray(arr)) return alert('Dữ liệu không hợp lệ');

    const newMap = new Map();
    arr.forEach(it => { if(it && it.short) newMap.set(String(it.short), { original: String(it.original||""), title: String(it.title||""), clicks: Number(it.clicks) || 0 }); });

    const snap = await getDocs(collection(db, "links"));
    const existingIds = new Set();
    snap.forEach(d => existingIds.add(d.id));

    const batch = writeBatch(db);
    for (const [short, value] of newMap.entries()) {
      const payload = { 
        original: value.original,
        clicks: value.clicks 
      };
      if (value.title) {
          payload.title = value.title;
      }
      batch.set(doc(db, "links", short), payload);
      existingIds.delete(short);
    }
    for (const id of existingIds) {
      batch.delete(doc(db, "links", id));
    }

    await batch.commit();
    await loadLinks();
    hideDataPopup();
    alert("Lưu dữ liệu vào Firestore thành công.");
  } catch(e){
    alert("Lỗi khi lưu dữ liệu: " + e.message);
  }
};


/* ---------- Confirm delete handlers ---------- */
function showConfirm(index) {
  pendingDeleteIndex = index;
  const popup = document.getElementById('confirmPopup');
  popup.style.display = 'flex';
  requestAnimationFrame(()=>{popup.classList.add('show');document.getElementById('confirmYes').focus();});
}
function hideConfirm(){
  const popup=document.getElementById('confirmPopup');
  popup.classList.remove('show');
  setTimeout(()=>popup.style.display='none',250);
  pendingDeleteIndex=null;
}
document.getElementById('confirmYes').onclick = async ()=> {
  if(pendingDeleteIndex !== null){
    const item = data[pendingDeleteIndex];
    try {
      await deleteDoc(doc(db, "links", item.short));
      data.splice(pendingDeleteIndex,1);
      render();
    } catch(e){ alert("Lỗi xóa: " + e.message); }
  }
  hideConfirm();
};
document.getElementById('confirmNo').onclick = hideConfirm;

/* ---------- Popup show/hide and copy ---------- */
function showDataPopup(){ const popup=document.getElementById('dataPopup'); popup.style.display='flex'; requestAnimationFrame(()=>popup.classList.add('show')); }
function hideDataPopup(){ const popup=document.getElementById('dataPopup'); popup.classList.remove('show'); setTimeout(()=>popup.style.display='none',250); }

document.getElementById('copyDataBtn').onclick = function(){ copyWithIcon(document.getElementById('dataTextarea').value, this); };
document.getElementById('showDataBtn').onclick = showDataPopup;
document.getElementById('closeDataPopup').onclick = hideDataPopup;

/* ---------- UI Event Listeners ---------- */
document.getElementById('createBtn').onclick = createNew;
document.getElementById('originalInput').addEventListener('keyup', (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
    }
});
document.getElementById('searchInput').oninput = () => {
  // Khi người dùng gõ tìm kiếm, luôn bắt đầu từ trang 1
  // và gọi loadLinks với nội dung ô tìm kiếm
  loadLinks(1, document.getElementById('searchInput').value);
};
document.getElementById('exportBtn').onclick = exportFile;
document.getElementById('importFiles').onchange = e=>{ importSelectedFiles(e.target.files); };

const handleLoginOnEnter = (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById('loginBtn').click();
    }
};
document.getElementById('adminEmail').addEventListener('keyup', handleLoginOnEnter);
document.getElementById('adminPass').addEventListener('keyup', handleLoginOnEnter);


async function loadLinks(targetPage = 1, searchQuery = '') {
  try {
    searchQuery = searchQuery.trim();
    const linksCollection = collection(db, "links");

    // --- Cập nhật logic đếm tổng số ---
    // Nếu có tìm kiếm, đếm các kết quả khớp. Nếu không, đếm tất cả.
    let countQuery;
    if (searchQuery) {
      countQuery = query(
        linksCollection,
        orderBy(documentId()),
        where(documentId(), '>=', searchQuery),
        where(documentId(), '<=', searchQuery + '\uf8ff')
      );
    } else {
      countQuery = query(linksCollection);
    }
    const countSnapshot = await getCountFromServer(countQuery);
    totalLinks = countSnapshot.data().count;

    // --- Cập nhật logic truy vấn dữ liệu ---
    let linksQuery;
    if (searchQuery) {
      // Query khi có tìm kiếm
      linksQuery = query(
        linksCollection,
        orderBy(documentId()),
        where(documentId(), '>=', searchQuery),
        where(documentId(), '<=', searchQuery + '\uf8ff'),
        limit(PER_PAGE)
      );
    } else {
      // Query khi không có tìm kiếm (phân trang bình thường)
      linksQuery = query(
        linksCollection,
        orderBy(documentId()),
        limit(PER_PAGE)
      );
    }

    // Logic phân trang với startAfter giữ nguyên cho cả 2 trường hợp
    if (targetPage > 1 && pageCursors[targetPage]) {
      // Phải xây dựng lại query với startAfter
      if (searchQuery) {
          linksQuery = query(linksCollection, orderBy(documentId()), where(documentId(), '>=', searchQuery), where(documentId(), '<=', searchQuery + '\uf8ff'), startAfter(pageCursors[targetPage]), limit(PER_PAGE));
      } else {
          linksQuery = query(linksCollection, orderBy(documentId()), startAfter(pageCursors[targetPage]), limit(PER_PAGE));
      }
    }

    const documentSnapshots = await getDocs(linksQuery);

    data = []; 
    documentSnapshots.forEach(docSnap => {
      const obj = docSnap.data();
      data.push({
        short: docSnap.id,
        original: obj.original || "",
        title: obj.title || "",
        clicks: obj.clicks || 0
      });
    });

    if (documentSnapshots.docs.length > 0) {
      const lastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
      pageCursors[targetPage + 1] = lastVisible;
    }

    // Reset con trỏ và trang khi thực hiện một tìm kiếm mới
    if(searchQuery && targetPage === 1){
        pageCursors = { 1: null };
    }

    page = targetPage;
    render();

  } catch (err) {
    console.error(err);
    alert("Lỗi khi tải dữ liệu: " + err.message);
  }
}

/* ---------- AUTHENTICATION ---------- */
document.getElementById('loginBtn').onclick = async () => {
  const email = document.getElementById('adminEmail').value.trim();
  const pass = document.getElementById('adminPass').value.trim();
  loginErrorEl.textContent = '';
  if (!email || !pass) {
    loginErrorEl.textContent = "Vui lòng nhập email và mật khẩu.";
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(err) {
    let friendlyMessage = "Đăng nhập thất bại. Vui lòng thử lại.";
    
    switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            friendlyMessage = "Sai email hoặc mật khẩu. Vui lòng kiểm tra lại.";
            break;
        case 'auth/invalid-email':
            friendlyMessage = "Địa chỉ email không hợp lệ.";
            break;
        case 'auth/too-many-requests':
            friendlyMessage = "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.";
            break;
    }
    
    loginErrorEl.textContent = friendlyMessage;
}
};

document.getElementById('logoutBtn').onclick = async () => {
  await signOut(auth);
};

onAuthStateChanged(auth, async user => {

  if (loaderContainer) {
    loaderContainer.style.display = 'none';
  }

  currentUser = user;
  if (user) {
    loginContainer.style.display = 'none';
    mainContainer.style.display = 'block';
    document.getElementById('authStatus').textContent = `Đã đăng nhập: ${user.email}`;
    document.getElementById('domainPrefix').textContent = location.origin.replace(/https?:\/\//, '') + '/';
    loginErrorEl.textContent = '';
    // Lấy tổng số link một lần để tính toán phân trang
    const countSnapshot = await getCountFromServer(collection(db, "links"));
    totalLinks = countSnapshot.data().count;
    // Tải trang đầu tiên
    loadLinks(1);

  } else {
    loginContainer.style.display = 'flex';
    mainContainer.style.display = 'none';
    data = [];
    totalLinks = 0;
    pageCursors = { 1: null };
    render();
  }
});
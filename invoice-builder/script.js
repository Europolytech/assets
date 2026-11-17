const storeKey="abInvoiceBuilder";const $=(id)=>document.getElementById(id);const fields=["invoiceNumber","invoiceStatus","issueDate","dueDate","sellerName","sellerEmail","sellerAddress","sellerTaxRef","paymentTerms","customerName","customerEmail","customerAddress","vatRate","currency","bankName","accountName","sortCode","accountNumber","notes"];const state={savedInvoiceNumber:null,savedInvoiceId:null,lines:[],invoices:[],payments:[]};function todayISO(){return new Date().toISOString().slice(0,10)}function addDaysISO(dateValue,days){const date=new Date(`${dateValue}T12:00:00`);date.setDate(date.getDate()+Number(days));return date.toISOString().slice(0,10)}function money(value,currency=$("currency").value){return new Intl.NumberFormat("en-GB",{style:"currency",currency}).format(Number(value)||0)}function loadStore(){/* Existing localStorage is read only during explicit migration. */}
function persistStore(){/* Never save financial records to localStorage. */}
function buildDefaultInvoice(){
 const issueDate=todayISO();
 $("invoiceNumber").value=nextCloudNumber();
 $("invoiceStatus").value="Draft";$("issueDate").value=issueDate;
 $("dueDate").value=addDaysISO(issueDate,$("paymentTerms").value);
 $("sellerName").value=$("sellerName").value||"Amine Belmejdoub";
 $("notes").value=$("notes").value||"Thank you for your business.";
 state.savedInvoiceNumber=null;state.savedInvoiceId=null;state.lines=[{description:"Professional services",quantity:1,rate:0}];
 renderLines();updatePreview();renderPayments();setSaveState("Not saved");
}
function collectInvoice(){const data=Object.fromEntries(fields.map((field)=>[field,$(field).value]));data.lines=state.lines.map((line)=>({description:line.description.trim(),quantity:Number(line.quantity)||0,rate:Number(line.rate)||0,amount:(Number(line.quantity)||0)*(Number(line.rate)||0)}));const subtotal=data.lines.reduce((sum,line)=>sum+line.amount,0);const vat=subtotal*Number(data.vatRate||0);data.subtotal=subtotal;data.vat=vat;data.total=subtotal+vat;data.savedAt=new Date().toISOString();return data}function previewBlock(...parts){return parts.filter(Boolean).join("\n")}function updatePreview(){const invoice=collectInvoice();$("previewNumber").textContent=invoice.invoiceNumber;$("previewStatus").textContent=invoice.invoiceStatus;$("previewSeller").textContent=previewBlock(invoice.sellerName,invoice.sellerAddress,invoice.sellerEmail,invoice.sellerTaxRef?`UTR/ref: ${invoice.sellerTaxRef}`:"");$("previewCustomer").textContent=previewBlock(invoice.customerName||"Customer name",invoice.customerAddress,invoice.customerEmail);$("previewDates").textContent=previewBlock(`Issued: ${formatDate(invoice.issueDate)}`,`Due: ${formatDate(invoice.dueDate)}`,`Terms: ${invoice.paymentTerms} days`);$("previewPayment").textContent=previewBlock(invoice.bankName,invoice.accountName?`Account: ${invoice.accountName}`:"",invoice.sortCode?`Sort code: ${invoice.sortCode}`:"",invoice.accountNumber?`Account number: ${invoice.accountNumber}`:"")||"Payment details";$("previewNotes").textContent=invoice.notes||"Thank you for your business.";$("subtotal").textContent=money(invoice.subtotal,invoice.currency);$("vatTotal").textContent=money(invoice.vat,invoice.currency);$("grandTotal").textContent=money(invoice.total,invoice.currency);const body=$("previewLines");body.innerHTML="";invoice.lines.forEach((line)=>{const tr=document.createElement("tr");tr.innerHTML=`<td>${escapeHtml(line.description||"Work item")}</td><td>${line.quantity}</td><td>${money(line.rate,invoice.currency)}</td><td>${money(line.amount,invoice.currency)}</td>`;body.appendChild(tr)})}function formatDate(value){if(!value)return"";return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(`${value}T12:00:00`))}function escapeHtml(value){return String(value).replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char])}function renderLines(){const editor=$("lineEditor");editor.innerHTML="";state.lines.forEach((line,index)=>{const row=document.createElement("div");row.className="line-row";row.innerHTML=`<label>Description<input type="text" value="${escapeHtml(line.description)}" data-line="${index}" data-key="description"></label><label>Qty<input type="number" min="0" step="0.01" value="${line.quantity}" data-line="${index}" data-key="quantity"></label><label>Rate<input type="number" min="0" step="0.01" value="${line.rate}" data-line="${index}" data-key="rate"></label><button class="remove-line" type="button" title="Remove item" data-remove="${index}">x</button>`;editor.appendChild(row)})}function setSaveState(text){$("saveState").textContent=text}let savingInvoice=null;
async function saveInvoice(){
 if(savingInvoice)return savingInvoice;
 $("saveInvoiceBtn").disabled=true;
 $("newInvoiceBtn").disabled=true;
 savingInvoice=saveInvoiceInternal();
 try{return await savingInvoice}
 finally{savingInvoice=null;$("saveInvoiceBtn").disabled=false;$("newInvoiceBtn").disabled=false}
}
async function saveInvoiceInternal(){
 if(!await requireCloud())return null;
 const invoice=collectInvoice();
 if(!invoice.customerName.trim()||!invoice.issueDate||!invoice.dueDate){
   setSaveState("Enter the customer and dates before saving");return null;
 }
 if(!invoice.lines.length||!invoice.lines.some(line=>line.description&&line.quantity>0)){
   setSaveState("Add at least one valid work item");return null;
 }
 setSaveState("Saving to cloud...");
 let id=null;
 if(state.savedInvoiceNumber){
   // Numbering is immutable. Edits reuse the original invoice's UUID.
   invoice.invoiceNumber=state.savedInvoiceNumber;
   id=state.savedInvoiceId||state.invoices.find(x=>x.invoiceNumber===invoice.invoiceNumber)?.id;
   if(!id){setSaveState("Save failed: reload cloud history and reopen this invoice");return null;}
   const {error}=await cloud.from("personal_invoices").upsert({
     id,user_id:cloudUser.id,invoice_number:invoice.invoiceNumber,
     currency:invoice.currency,total:Number(invoice.total.toFixed(2)),payload:invoice
   },{onConflict:"id"});
   if(error){setSaveState("Save failed: "+error.message);return null;}
 }else{
   // First save is the moment an invoice number is assigned. Fetch live server
   // data and INSERT (never upsert), with unique-constraint collision retries.
   // This prevents duplicates if two devices create invoices simultaneously.
   const year=invoiceYear();
   let created=false;
   for(let attempt=0;attempt<10;attempt++){
     const {number,error:sequenceError}=await nextCloudNumberFromServer(year);
     if(sequenceError){setSaveState("Save failed: "+sequenceError.message);return null;}
     const candidate=number;
     const proposedId=crypto.randomUUID();
     const payload={...invoice,invoiceNumber:candidate};
     const {error}=await cloud.from("personal_invoices").insert({
       id:proposedId,user_id:cloudUser.id,invoice_number:candidate,
       currency:invoice.currency,total:Number(invoice.total.toFixed(2)),payload
     });
     if(!error){
       id=proposedId;invoice.invoiceNumber=candidate;created=true;
       break;
     }
     if(isDuplicateInvoiceError(error))continue;
     setSaveState("Save failed: "+error.message);return null;
   }
   if(!created){
     setSaveState("Number allocation was busy. Please try saving again.");
     return null;
   }
 }
 // Only update the active editor after Supabase has confirmed the save.
 state.savedInvoiceId=id;
 state.savedInvoiceNumber=invoice.invoiceNumber;
 $("invoiceNumber").value=invoice.invoiceNumber;
 updatePreview();
 await loadHistory();
 renderPayments();
 setSaveState("Saved to cloud");
 return id;
}
function renderRegister(){
 const body=$("registerTable").querySelector("tbody");body.innerHTML="";
 const term=($("registerSearch")?.value||"").toLowerCase();
 const rows=state.invoices.filter(x=>[x.invoiceNumber,x.customerName,x.invoiceStatus].some(v=>String(v||"").toLowerCase().includes(term)));
 rows.sort((a,b)=>String(b.savedAt||"").localeCompare(String(a.savedAt||"")));
 for(const invoice of rows){
   const paid=paymentSum(invoice.id),balance=Math.max(0,Number(invoice.total||0)-paid);
   const tr=document.createElement("tr");
   tr.innerHTML=`<td>${escapeHtml(invoice.invoiceNumber)}</td><td>${escapeHtml(invoice.customerName||"")}</td><td>${escapeHtml(invoice.issueDate||"")}</td><td>${escapeHtml(invoice.dueDate||"")}</td><td>${escapeHtml(invoice.invoiceStatus||"")}</td><td>${money(invoice.total,invoice.currency)}</td><td>${money(paid,invoice.currency)}</td><td>${money(balance,invoice.currency)}</td><td><button class="ghost" type="button" data-open-id="${escapeHtml(invoice.id)}">Open</button></td>`;
   body.appendChild(tr);
 }
 $("registerCount").textContent=`${state.invoices.length} invoice${state.invoices.length===1?"":"s"}`;
}
function registerRows(){const headers=["Invoice Number","Status","Customer Name","Customer Email","Issue Date","Due Date","Currency","Subtotal","VAT","Total","Seller","Saved At"];const rows=state.invoices.map((invoice)=>[invoice.invoiceNumber,invoice.invoiceStatus,invoice.customerName,invoice.customerEmail,invoice.issueDate,invoice.dueDate,invoice.currency,invoice.subtotal.toFixed(2),invoice.vat.toFixed(2),invoice.total.toFixed(2),invoice.sellerName,invoice.savedAt]);return[headers,...rows]}function toCsv(rows){return rows.map((row)=>row.map((cell)=>`"${String(cell??"").replace(/"/g,'""')}"`).join(",")).join("\r\n")}function download(name,mime,content){const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}function exportCsv(){download("invoice-register.csv","text/csv;charset=utf-8",toCsv(registerRows()))}function exportExcel(){const rows=registerRows();const tableRows=rows.map((row,index)=>{const tag=index===0?"th":"td";return`<tr>${row.map((cell)=>`<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`}).join("");const html=`<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows}</table></body></html>`;download("invoice-register.xls","application/vnd.ms-excel;charset=utf-8",html)}function backupJson(){download("invoice-register-backup.json","application/json;charset=utf-8",JSON.stringify({invoices:state.invoices},null,2))}function emailInvoice(){const invoice=collectInvoice();const subject=`Invoice ${invoice.invoiceNumber} from ${invoice.sellerName||"Amine Belmejdoub"}`;const body=[`Dear ${invoice.customerName||"Customer"}`,"",`Please find invoice ${invoice.invoiceNumber} for ${money(invoice.total,invoice.currency)}.`,`Issue date: ${formatDate(invoice.issueDate)}`,`Due date: ${formatDate(invoice.dueDate)}`,"","Kind regards",invoice.sellerName||"Amine Belmejdoub"].join("\n");const to=encodeURIComponent(invoice.customerEmail||"");window.location.href=`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}document.addEventListener("input",(event)=>{const target=event.target;if(!target.dataset.line && !fields.includes(target.id))return;if(target.dataset.line){const line=state.lines[Number(target.dataset.line)];line[target.dataset.key]=target.dataset.key==="description"?target.value:Number(target.value);updatePreview();setSaveState("Unsaved changes");return}updatePreview();setSaveState("Unsaved changes")});document.addEventListener("change",(event)=>{if(event.target.id==="paymentTerms"||event.target.id==="issueDate"){$("dueDate").value=addDaysISO($("issueDate").value||todayISO(),$("paymentTerms").value)}updatePreview()});$("lineEditor").addEventListener("click",(event)=>{const button=event.target.closest("[data-remove]");if(!button)return;state.lines.splice(Number(button.dataset.remove),1);if(!state.lines.length)state.lines.push({description:"",quantity:1,rate:0});renderLines();updatePreview()});$("addLineBtn").addEventListener("click",()=>{state.lines.push({description:"",quantity:1,rate:0});renderLines();updatePreview()});$("saveInvoiceBtn").addEventListener("click",saveInvoice);$("newInvoiceBtn").addEventListener("click",()=>{if($("saveState").textContent==="Unsaved changes"&&!confirm("Discard unsaved changes?"))return;buildDefaultInvoice()});$("printBtn").addEventListener("click",()=>window.print());$("emailBtn").addEventListener("click",async()=>{if($("saveState").textContent!=="Saved to cloud"){const id=await saveInvoice();if(!id)return;}emailInvoice()});$("exportCsvBtn").addEventListener("click",exportCsv);$("exportExcelBtn").addEventListener("click",exportExcel);$("downloadJsonBtn").addEventListener("click",backupJson);buildDefaultInvoice();renderRegister();


// Secure storage uses Supabase's public browser key and strict database RLS.
// The configuration is not secret; the service-role key MUST NEVER enter the browser.
let cloud=null,cloudUser=null,autoTimer=null,loading=false,revision=0;
const setupKey="abInvoiceCloudConfig";
const SUPABASE_IMPORT="./supabase-client.js?v=20261117-sequence-v1";
let cloudConfig;
try{cloudConfig=JSON.parse(localStorage.getItem(setupKey)||"null")}catch{cloudConfig=null}
function cloudStatus(message){$("cloudState").textContent=message;$("syncStatus").textContent=message;}
function paymentSum(invoiceId){return state.payments.filter(p=>p.invoice_id===invoiceId).reduce((sum,p)=>sum+Number(p.amount||0),0)}
// UK calendar year controls the prefix, regardless of the viewer's device timezone.
function invoiceYear(){
 return Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric"}).format(new Date()));
}
function parseInvoiceSequence(number,year){
 const m=/^AB-(\d{4})-(\d{4,})$/.exec(String(number||""));
 if(!m||Number(m[1])!==year)return 0;
 const sequence=Number(m[2]);
 return Number.isSafeInteger(sequence)&&sequence>0?sequence:0;
}
function formatInvoiceNumber(year,sequence){
 return "AB-"+year+"-"+String(sequence).padStart(4,"0");
}
function nextCloudNumber(){
 const year=invoiceYear();
 const max=state.invoices.reduce((high,row)=>Math.max(high,parseInvoiceSequence(row.invoiceNumber,year)),0);
 return formatInvoiceNumber(year,max+1);
}
async function nextCloudNumberFromServer(year){
 // Do not rely on localStorage or the register cache; this queries the live
 // owner-scoped database. Page through all rows, rather than reusing gaps.
 let max=0;
 for(let from=0;;from+=500){
   const {data,error}=await cloud.from("personal_invoices")
     .select("invoice_number")
     .order("invoice_number",{ascending:false})
     .range(from,from+499);
   if(error)return {number:null,error};
   for(const row of data||[])max=Math.max(max,parseInvoiceSequence(row.invoice_number,year));
   if(!data||data.length<500)break;
 }
 return {number:formatInvoiceNumber(year,max+1),error:null};
}
function isDuplicateInvoiceError(error){
 return error?.code==="23505"||(
   error?.status===409&&/duplicate key|unique constraint|23505/i.test(error.message||"")
 );
}
async function initializeClient(url,key){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||!key){cloudStatus("Enter a valid Supabase URL and publishable/anon key.");return false}
 try{
   const mod=await import(SUPABASE_IMPORT);
   cloud=mod.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   const {data:{session},error}=await cloud.auth.getSession();
   if(error)throw error;
   cloudUser=session?.user||null;
   $("signInBtn").hidden=!!cloudUser;$("signOutBtn").hidden=!cloudUser;
   if(cloudUser)await loadHistory();else cloudStatus("Connected — sign in to load your history");
   cloud.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>applySession(session),0)});
   return true;
 }catch(e){cloudStatus("Cloud connection failed: "+e.message);return false}
}
async function applySession(session){
 const previous=cloudUser?.id;
 cloudUser=session?.user||null;
 $("signInBtn").hidden=!!cloudUser;$("signOutBtn").hidden=!cloudUser;
 if(!cloudUser){state.invoices=[];state.payments=[];state.savedInvoiceNumber=null;state.savedInvoiceId=null;renderRegister();renderPayments();cloudStatus("Signed out");return}
 if(previous!==cloudUser.id)await loadHistory();
}
async function initCloud(){
 $("paymentDate").value=todayISO();
 $("supabaseUrl").value=cloudConfig?.url||"";
 $("supabaseKey").value=cloudConfig?.key||"";
 if(cloudConfig?.url&&cloudConfig?.key)await initializeClient(cloudConfig.url,cloudConfig.key);
 else cloudStatus("Cloud not configured — open Cloud storage setup");
}
async function requireCloud(){
 if(!cloud){cloudStatus("Configure Supabase in Cloud storage setup first.");return false}
 if(!cloudUser){cloudStatus("Sign in before saving or retrieving invoices.");return false}
 return true;
}
async function loadHistory(){
 if(!await requireCloud())return;
 if(loading)return;
 loading=true;cloudStatus("Loading cloud history...");
 try{
   const invoices=[],payments=[];
   for(let from=0;;from+=500){
     const {data,error}=await cloud.from("personal_invoices").select("id,invoice_number,payload,total,currency,updated_at").order("updated_at",{ascending:false}).range(from,from+499);
     if(error)throw error;
     invoices.push(...data);
     if(data.length<500)break;
   }
   for(let from=0;;from+=500){
     const {data,error}=await cloud.from("personal_payments").select("id,invoice_id,amount,currency,paid_on,method,reference,created_at").order("created_at",{ascending:false}).range(from,from+499);
     if(error)throw error;
     payments.push(...data);
     if(data.length<500)break;
   }
   state.invoices=invoices.map(row=>({...row.payload,id:row.id,invoiceNumber:row.invoice_number,currency:row.currency,total:Number(row.total)}));
   state.payments=payments;
   // A not-yet-saved draft gets an updated preview number after cloud history loads.
   if(!state.savedInvoiceNumber){$("invoiceNumber").value=nextCloudNumber();updatePreview();}
   renderRegister();renderPayments();
   cloudStatus("Cloud connected — "+invoices.length+" invoices, "+payments.length+" payments");
 }catch(e){cloudStatus("History load failed: "+e.message)}
 finally{loading=false}
}
function openInvoice(id){
 const row=state.invoices.find(i=>i.id===id);if(!row)return;
 if($("saveState").textContent==="Unsaved changes"&&!confirm("Discard unsaved changes?"))return;
 for(const field of fields)$(field).value=row[field]??"";
 state.lines=(row.lines||[]).map(x=>({description:x.description||"",quantity:Number(x.quantity)||0,rate:Number(x.rate)||0}));
 if(!state.lines.length)state.lines=[{description:"",quantity:1,rate:0}];
 state.savedInvoiceNumber=row.invoiceNumber;state.savedInvoiceId=row.id;renderLines();updatePreview();renderPayments();
 setSaveState("Loaded from cloud");
 window.scrollTo({top:0,behavior:"smooth"});
}
function renderPayments(){
 const current=state.invoices.find(i=>i.invoiceNumber===$("invoiceNumber").value && i.invoiceNumber===state.savedInvoiceNumber);
 const paid=current?paymentSum(current.id):0;
 const balance=Math.max(0,Number(collectInvoice().total||0)-paid);
 $("paymentBalance").textContent="Balance due: "+money(balance);
 const tbody=$("paymentTable").querySelector("tbody");tbody.innerHTML="";
 for(const p of (current?state.payments.filter(p=>p.invoice_id===current.id):[])){
   const tr=document.createElement("tr");
   tr.innerHTML="<td>"+escapeHtml(p.paid_on)+"</td><td>"+escapeHtml(p.method)+"</td><td>"+escapeHtml(p.reference||"")+"</td><td>"+money(p.amount,p.currency)+"</td>";
   tbody.appendChild(tr);
 }
}
async function recordPayment(){
 if(!await requireCloud())return;
 const invoice=state.invoices.find(i=>i.invoiceNumber===$("invoiceNumber").value&&i.invoiceNumber===state.savedInvoiceNumber);
 if(!invoice){cloudStatus("Save this invoice to the cloud before recording payments.");return}
 if($("saveState").textContent==="Unsaved changes"){cloudStatus("Save invoice changes before recording a payment.");return}
 const amount=Number($("paymentAmount").value);
 const outstanding=Number((Number(invoice.total)-paymentSum(invoice.id)).toFixed(2));
 if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)>Math.round(outstanding*100)){cloudStatus("Payment must be positive and cannot exceed the outstanding balance.");return}
 const paid_on=$("paymentDate").value;
 if(!paid_on){cloudStatus("Choose a payment date.");return}
 $("recordPaymentBtn").disabled=true;
 const {error}=await cloud.from("personal_payments").insert({
   user_id:cloudUser.id,invoice_id:invoice.id,amount:Number(amount.toFixed(2)),
   currency:invoice.currency,paid_on,method:$("paymentMethod").value,
   reference:$("paymentReference").value.trim()
 });
 $("recordPaymentBtn").disabled=false;
 if(error){cloudStatus("Payment save failed: "+error.message);return}
 $("paymentAmount").value="";$("paymentReference").value="";
 await loadHistory();renderPayments();
 cloudStatus("Payment recorded permanently");
}
async function signIn(){
 if(!cloud){cloudStatus("Configure cloud storage first.");return}
 const email=prompt("Enter the email address for your private invoice account:");
 if(!email)return;
 const {error}=await cloud.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:location.origin+location.pathname}});
 cloudStatus(error?"Sign-in failed: "+error.message:"Sign-in link requested. Check your email; the sign-in provider must be configured.");
}
async function importOldInvoices(){
 if(!await requireCloud())return;
 let old;
 try{old=JSON.parse(localStorage.getItem(storeKey)||"{}").invoices||[]}catch{cloudStatus("Old browser data could not be parsed.");return}
 if(!old.length){cloudStatus("No old browser invoices to import.");return}
 if(!confirm("Import "+old.length+" invoice(s) from this browser? Existing cloud invoice numbers will be left unchanged."))return;
 let count=0,skipped=0;
 const existing=new Set(state.invoices.map(i=>i.invoiceNumber));
 for(const row of old){
   if(!row.invoiceNumber||existing.has(row.invoiceNumber)){skipped++;continue}
   if(!["GBP","EUR","USD","CAD"].includes(row.currency)){skipped++;continue}
   const {error}=await cloud.from("personal_invoices").insert({
     id:crypto.randomUUID(),user_id:cloudUser.id,invoice_number:row.invoiceNumber,
     currency:row.currency,total:Number(row.total)||0,payload:row
   });
   if(error){cloudStatus("Migration paused: "+error.message);await loadHistory();return}
   existing.add(row.invoiceNumber);count++;
 }
 await loadHistory();cloudStatus("Migrated "+count+" old invoices; skipped "+skipped+" duplicates/invalid records. Original browser data retained.");
}
$("configureCloudBtn").addEventListener("click",async()=>{
 const url=$("supabaseUrl").value.trim().replace(/\/$/,""),key=$("supabaseKey").value.trim();
 if(await initializeClient(url,key)){
   cloudConfig={url,key};
   localStorage.setItem(setupKey,JSON.stringify(cloudConfig));
   cloudStatus(cloudUser?"Cloud connected":"Configured. Sign in to access records.");
 }
});
$("signInBtn").addEventListener("click",signIn);
$("signOutBtn").addEventListener("click",async()=>{if(cloud)await cloud.auth.signOut()});
$("importLocalBtn").addEventListener("click",importOldInvoices);
$("reloadHistoryBtn").addEventListener("click",loadHistory);
$("recordPaymentBtn").addEventListener("click",recordPayment);
$("registerSearch").addEventListener("input",renderRegister);
$("registerTable").addEventListener("click",e=>{const button=e.target.closest("[data-open-id]");if(button)openInvoice(button.dataset.openId)});
document.addEventListener("input",e=>{
 if(!e.target.closest(".editor"))return;
 if(["registerSearch","supabaseUrl","supabaseKey","paymentAmount","paymentDate","paymentReference"].includes(e.target.id))return;
 clearTimeout(autoTimer);
 if(!cloudUser||!state.savedInvoiceNumber)return;
 if(!fields.includes(e.target.id)&&!e.target.dataset.line)return;
 const expected=state.savedInvoiceNumber;
 autoTimer=setTimeout(async()=>{
   if(state.savedInvoiceNumber!==expected||!cloudUser)return;
   await saveInvoice();
 },1200);
});
document.addEventListener("change",e=>{
 if(fields.includes(e.target.id)){renderPayments()}
});

initCloud();

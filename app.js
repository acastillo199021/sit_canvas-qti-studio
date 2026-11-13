const state = {
  files: [],
  groups: [],
  filter: "all",
  search: "",
  selectedBankId: null,
  selectedQuestionId: null,
  validation: null,
  activeTab: "editor",
  activeView: "setup",
  questionTypeFilter: "all",
  issueFilter: "all",
  feedbackFilter: "all",
  importWarnings: [],
  editorExpanded: false,
  idSequence: 0
};

const dom = {
  fileInput: document.getElementById("fileInput"),
  dropzone: document.getElementById("dropzone"),
  defaultPoints: document.getElementById("defaultPoints"),
  questionsPerSet: document.getElementById("questionsPerSet"),
  outputMode: document.getElementById("outputMode"),
  searchBox: document.getElementById("searchBox"),
  questionTypeFilter: document.getElementById("questionTypeFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  goReviewBtn: document.getElementById("goReviewBtn"),
  downloadReportBtn: document.getElementById("downloadReportBtn"),
  validationState: document.getElementById("validationState"),
  setupValidationMessage: document.getElementById("setupValidationMessage"),
  setupBankCount: document.getElementById("setupBankCount"),
  setupQuestionCount: document.getElementById("setupQuestionCount"),
  setupPointCount: document.getElementById("setupPointCount"),
  setupGood: document.getElementById("setupGood"),
  setupReview: document.getElementById("setupReview"),
  setupCorrection: document.getElementById("setupCorrection"),
  resultCount: document.getElementById("resultCount"),
  reviewValidateBtn: document.getElementById("reviewValidateBtn"),
  reviewExportBtn: document.getElementById("reviewExportBtn"),
  reviewExportNotice: document.getElementById("reviewExportNotice"),
  reviewTabCount: document.getElementById("reviewTabCount"),
  includeHeading: document.getElementById("includeHeading"),
  excludeReferences: document.getElementById("excludeReferences"),
  shuffleAnswers: document.getElementById("shuffleAnswers"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  validateBtn: document.getElementById("validateBtn"),
  exportBtn: document.getElementById("exportBtn"),
  fileTray: document.getElementById("fileTray"),
  statusBanner: document.getElementById("statusBanner"),
  bankList: document.getElementById("bankList"),
  questionList: document.getElementById("questionList"),
  editorPanel: document.getElementById("editorPanel"),
  previewPanel: document.getElementById("previewPanel"),
  validationPanel: document.getElementById("validationPanel"),
  countAll: document.getElementById("countAll"),
  countGood: document.getElementById("countGood"),
  countReview: document.getElementById("countReview"),
  countCorrection: document.getElementById("countCorrection"),
  bankCountPill: document.getElementById("bankCountPill"),
  currentFilterLabel: document.getElementById("currentFilterLabel"),
  addQuestionBtn: document.getElementById("addQuestionBtn"),
  expandEditorBtn: document.getElementById("expandEditorBtn"),
  issueFilterBars: [...document.querySelectorAll(".issue-filter-bar")]
};

const esc = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const textFromHtml = html => {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return (d.textContent || "").trim();
};

const normalizeSpaces = value => String(value ?? "")
  .replace(/[\\_]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// Convert institutional CDN image URLs (including Word hyperlinks) into
// image paragraphs before preview and QTI generation. No network fetch occurs.
const CDN_IMAGE_URL_RX = /https:\/\/cdn-media\.[a-z0-9.-]+\/[^\s<>"'()]+?\.(?:png|jpe?g|gif|webp)(?:\?[^\s<>"'()]*)?/gi;
function canonicalCdnImageUrl(candidate) {
  try {
    const url = new URL(candidate.trim());
    return url.protocol === "https:" && url.hostname.toLowerCase().startsWith("cdn-media.") &&
      /\.(?:png|jpe?g|gif|webp)$/i.test(url.pathname) ? url.href : null;
  } catch (_) { return null; }
}
function normalizeQuestionStemHtml(stem) {
  if (!stem || !/cdn-media\./i.test(stem)) return stem || "";
  const doc = new DOMParser().parseFromString(`<div id="stem-root">${stem}</div>`, "text/html");
  const root = doc.getElementById("stem-root");
  if (!root) return stem;
  const found = new Set();
  const originalImages = new Set([...root.querySelectorAll("img[src]")]
    .map(el => canonicalCdnImageUrl(el.getAttribute("src") || "")).filter(Boolean));
  // Anchors with CDN image targets must not display as raw URL text.
  for (const a of [...root.querySelectorAll("a[href]")]) {
    const url = canonicalCdnImageUrl(a.getAttribute("href") || "");
    if (url) {
      if (!originalImages.has(url)) found.add(url);
      a.replaceWith(doc.createTextNode(""));
    }
  }
  // A URL may also be plain text rather than a Word hyperlink.
  const walker = doc.createTreeWalker(root, 4);
  const nodes=[];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  for (const textNode of nodes) {
    if (textNode.parentElement?.closest("code,pre,script,style")) continue;
    const value=textNode.nodeValue || "";
    CDN_IMAGE_URL_RX.lastIndex=0;
    if (!CDN_IMAGE_URL_RX.test(value)) continue;
    CDN_IMAGE_URL_RX.lastIndex=0;
    const fragment=doc.createDocumentFragment();
    let index=0, match;
    while ((match=CDN_IMAGE_URL_RX.exec(value))) {
      if (match.index>index) fragment.appendChild(doc.createTextNode(value.slice(index,match.index)));
      const url=canonicalCdnImageUrl(match[0]);
      if (url) {
        if (!originalImages.has(url)) found.add(url);
      } else fragment.appendChild(doc.createTextNode(match[0]));
      index=match.index+match[0].length;
    }
    if(index<value.length) fragment.appendChild(doc.createTextNode(value.slice(index)));
    textNode.replaceWith(fragment);
  }
  if (!found.size) return root.innerHTML.trim() || stem;
  const content=root.innerHTML.trim().replace(/(?:\s|&nbsp;|<br\s*\/?\s*>)+$/gi, "").replace(/[\s\u00a0]+<\/p>/gi, "</p>").trim();
  const blockStart=/<(?:p|div|ul|ol|h[1-6]|table)\b/i.test(content);
  const headingText=content ? (blockStart ? content : `<p>${content}</p>`) : "";
  const imageParagraphs=[...found].map(url =>
    `<p><img style="display: block; margin-left: auto; margin-right: auto;" role="presentation" src="${esc(url)}" alt="" width="640" height="360" /></p>`);
  return [headingText,...imageParagraphs].filter(Boolean).join("\n");
}

const questionTitleFromGroupTitle = (title, index) => {
  const trimmed = String(title || "").trim();
  // Special case: an Arabic numeral OR a standalone uppercase Roman numeral
  // at the very end of the GROUP TITLE (not a digit in the middle).
  return /(?:\d+|\s(?:[IVXLCDM]{1,8}))$/.test(trimmed)
    ? `${trimmed} - Q${index}` : `${trimmed} ${index}`;
};

const byId = id => state.groups
  .flatMap(group => group.questions)
  .find(question => question.id === id);

const selectedQuestion = () => byId(state.selectedQuestionId);
const typeLabel = type => ({
  multiple_choice_question: "Multiple Choice",
  multiple_answers_question: "Multiple Answers",
  true_false_question: "True / False",
  matching_question: "Matching",
  multiple_dropdowns_question: "Multiple Dropdowns"
}[type] || type);


// "Multiple Choice with Images" is a review category, not a distinct QTI type.
const hasQuestionImage = question => {
  const source = [question.stem || "", ...(question.choices || []).map(choice => choice.html || "")].join(" ");
  return /<img\b/i.test(source) || /https:\/\/cdn-media\.[^\s<>"']+\.(?:png|jpe?g|gif|webp)(?:\?|\b)/i.test(source);
};
const questionCategory = question => {
  if (question.type === "multiple_dropdowns_question") return "multiple_dropdowns";
  if (question.type === "matching_question") return "matching";
  if (question.type === "multiple_answers_question") return "multiple_answers";
  if (question.type === "true_false_question") return "true_false";
  if (question.type === "multiple_choice_question" && hasQuestionImage(question)) return "multiple_choice_images";
  if (question.type === "multiple_choice_question") return "multiple_choice";
  return "unsupported";
};
const questionDisplayType = question => ({
  multiple_choice: "Multiple Choice", multiple_answers: "Multiple Answers",
  multiple_choice_images: "Multiple Choice with Images",
  matching: "Matching", multiple_dropdowns: "Multiple Dropdowns", true_false: "True / False",
  unsupported: "Unsupported type"
}[questionCategory(question)]);

function switchView(view) {
  state.activeView = view;
  document.querySelectorAll(".main-tab").forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".main-view").forEach(panel => {
    const active = panel.id === `${view}View`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}
document.querySelectorAll(".main-tab").forEach(button =>
  button.addEventListener("click", () => switchView(button.dataset.view))
);
dom.goReviewBtn.addEventListener("click", () => switchView("review"));
dom.downloadReportBtn.addEventListener("click", () => {
  if (!state.validation) return;
  saveBlob(new Blob([JSON.stringify(state.validation, null, 2)], {type:"application/json"}), "qti_validation_report.json");
});
dom.clearFiltersBtn.addEventListener("click", () => clearAllQuestionFilters());
dom.questionTypeFilter.addEventListener("change", () => {
  state.questionTypeFilter = dom.questionTypeFilter.value;
  renderAll();
});

function setStatus(message, type = "info") {
  dom.statusBanner.className = `status-banner ${type}`;
  dom.statusBanner.innerHTML = message;
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `${tab}Tab`);
  });
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.querySelectorAll(".filter-card").forEach(btn => {
  btn.addEventListener("click", () => {
    state.filter = btn.dataset.filter;
    document.querySelectorAll(".filter-card").forEach(x => x.classList.toggle("active", x === btn));
    renderAll();
  });
});

dom.searchBox.addEventListener("input", e => {
  state.search = e.target.value.trim().toLowerCase();
  renderAll();
});

dom.fileInput.addEventListener("change", e => useFiles([...e.target.files]));
["dragenter","dragover"].forEach(evt => dom.dropzone.addEventListener(evt, e => {
  e.preventDefault();
  dom.dropzone.classList.add("drag");
}));
["dragleave","drop"].forEach(evt => dom.dropzone.addEventListener(evt, e => {
  e.preventDefault();
  dom.dropzone.classList.remove("drag");
}));
dom.dropzone.addEventListener("drop", e => useFiles([...e.dataTransfer.files]));

dom.analyzeBtn.addEventListener("click", analyzeFiles);
dom.validateBtn.addEventListener("click", runValidation);
dom.exportBtn.addEventListener("click", exportQti);
dom.reviewValidateBtn.addEventListener("click", runValidation);
dom.reviewExportBtn.addEventListener("click", exportQti);

[dom.defaultPoints, dom.questionsPerSet, dom.includeHeading, dom.excludeReferences, dom.shuffleAnswers, dom.outputMode].forEach(el => {
  el.addEventListener("change", () => {
    if (state.groups.length) {
      state.validation = null;
      revalidateAll();
      renderAll();
    }
  });
});

function useFiles(files) {
  const docxFiles = files.filter(file => file.name.toLowerCase().endsWith(".docx"));
  if (!docxFiles.length) {
    setStatus("Please select one or more .docx files.", "correction");
    return;
  }
  state.files = docxFiles;
  state.groups = [];
  state.selectedBankId = null;
  state.selectedQuestionId = null;
  state.validation = null;
  renderFiles();
  dom.analyzeBtn.disabled = false;
  dom.validateBtn.disabled = true;
  dom.exportBtn.disabled = true;
  setStatus(`Ready to analyze ${docxFiles.length} Word file(s).`, "good");
  renderAll();
}

function renderFiles() {
  if (!state.files.length) {
    dom.fileTray.innerHTML = "";
    return;
  }
  dom.fileTray.innerHTML = state.files.map((file, index) => `
    <div class="file-chip">
      <div>
        <strong>${esc(file.name)}</strong>
        <small>${(file.size / 1024).toFixed(1)} KB</small>
      </div>
      <button type="button" data-remove-file="${index}">Remove</button>
    </div>
  `).join("");

  dom.fileTray.querySelectorAll("[data-remove-file]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.files.splice(Number(btn.dataset.removeFile), 1);
      state.groups = []; state.validation = null; state.selectedBankId = null; state.selectedQuestionId = null;
      dom.analyzeBtn.disabled = !state.files.length; dom.exportBtn.disabled = true; dom.validateBtn.disabled = true;
      if (!state.files.length) {
        state.groups = [];
        state.selectedBankId = null;
        state.selectedQuestionId = null;
        state.validation = null;
        dom.analyzeBtn.disabled = true;
        dom.validateBtn.disabled = true;
        dom.exportBtn.disabled = true;
        setStatus("Upload one or more Word files to begin.", "info");
      }
      renderFiles();
      renderAll();
    });
  });
}

async function analyzeFiles() {
  if (!state.files.length) return;
  try {
    setStatus("Reading Word file(s) and detecting banks...", "info");
    state.groups = [];
    state.importWarnings = [];
    let allGroups = [];
    for (let i = 0; i < state.files.length; i += 1) {
      const file = state.files[i];
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer }, {
        styleMap: [
          "u => u",
          "b => strong",
          "i => em"
        ]
      });
      const fileGroups = parseHtmlToGroups(result.value, file.name);
      allGroups = allGroups.concat(fileGroups);
    }
    state.groups = allGroups;
    revalidateAll();
    state.selectedBankId = state.groups[0]?.id || null;
    state.selectedQuestionId = state.groups[0]?.questions[0]?.id || null;
    state.validation = null;
    dom.validateBtn.disabled = !state.groups.length;
    dom.exportBtn.disabled = true;
    renderAll();
    setStatus(`Analysis complete. Detected ${state.groups.length} bank(s). Open Question Review to inspect the results.`, state.groups.some(g => g.status === "correction") ? "correction" : state.groups.some(g => g.status === "review") ? "review" : "good");
  } catch (error) {
    console.error(error);
    setStatus("The file could not be analyzed. Confirm it is a valid .docx and follows the expected group format.", "correction");
  }
}

function blockInnerHtml(el) {
  const temp = document.createElement("div");
  temp.appendChild(el.cloneNode(true));
  const outer = temp.innerHTML.trim();
  return outer.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "").trim();
}

function parseTable(table) {
  // Parse ALL two-column rows. Header candidates are structural metadata,
  // NOT discarded based on words such as "Structure" or "Meaning".
  return [...table.querySelectorAll("tr")].map((tr, index) => ({
    header: [...tr.children].some(cell => cell.tagName.toLowerCase() === "th") ||
      tr.closest("thead") !== null || tr.getAttribute("data-header") === "true",
    first: index === 0,
    values: [...tr.children].filter(cell => /^(td|th)$/i.test(cell.tagName))
      .map(cell => normalizeSpaces(cell.textContent))
  })).filter(row => row.values.length === 2 && row.values.some(Boolean))
    .map(row => ({left:row.values[0],right:row.values[1],header:row.header,first:row.first}));
}

function stripOptionLabel(value) {
  return String(value || "").replace(/^\s*[A-Z]\s*[.)]\s*/i, "").trim();
}
function extractLetter(value) {
  return String(value || "").match(/^\s*([A-Z])\s*[.)]\s*/i)?.[1]?.toUpperCase() || null;
}
function parseKeyEntries(value) {
  return [...String(value || "").matchAll(/(\d+)\s*[-–—:]\s*([A-Z])\b/gi)]
    .map(m=>({number:Number(m[1]),letter:m[2].toUpperCase()}));
}
function resolveMatchingKey(question) {
  const problems=[];
  const descriptions=question.matchingDescriptions || [];
  const pool=question.matchingOptionPool || [];
  const mapping=question.matchingAnswerKey || [];
  if (!descriptions.length || !pool.length || !mapping.length) return;
  const numbers=new Map();
  for(const item of mapping) {
    if(numbers.has(item.number)) problems.push(`Duplicate answer key for description ${item.number}.`);
    numbers.set(item.number,item.letter);
  }
  const byLetter=new Map();
  for(const option of pool) {
    if(byLetter.has(option.label)) problems.push(`Duplicate option label ${option.label}.`);
    byLetter.set(option.label,option.text);
  }
  const pairs=[];
  for (let index=0;index<descriptions.length;index++) {
    const number=index+1;
    const letter=numbers.get(number);
    if (!letter || !byLetter.has(letter)) {
      problems.push(`Description ${number} has no valid matching answer.`);
      continue;
    }
    pairs.push({left:descriptions[index],right:byLetter.get(letter)});
  }
  for (const number of numbers.keys()) {
    if (number < 1 || number > descriptions.length) problems.push(`Answer key references missing description ${number}.`);
  }
  question.type="matching_question";
  question.pairs=pairs;
  question.distractors=pool.filter(option=>!mapping.some(entry=>entry.letter===option.label)).map(option=>option.text);
  question.matchingNotes=pairs.map(pair=>`<li>${esc(pair.left)} → ${esc(pair.right)}</li>`);
  question.parseIssues.push(...problems.map(text=>({level:"correction",text})));
}

// Classic Canvas Multiple Dropdowns: one response_lid for every named blank.
// Two supported Word variants: [*answer, distractor] per line, or numbered
// blanks with a shared A/B/C option pool and a Correct Matches key.
function dropdownInline(line) {
  const found = String(line || "").match(/^(.*?)\s*\[([^\[\]]+)\]\s*$/s);
  if (!found || !found[2].includes(",")) return null;
  const options = found[2].split(",").map(x => x.trim()).filter(Boolean).map(x => ({
    text:x.replace(/^\*+\s*/, ""), correct:/^\*/.test(x)
  }));
  return options.length >= 2 ? {prompt:found[1].trim(),options} : null;
}
function normalBlankId(prompt, number) {
  const match = prompt.match(/^Label\s+([A-Za-z0-9]+)\b/i);
  return match ? `label_${match[1].toLowerCase()}` : `blank${number}`;
}
function uniqueBlankId(question, preferred) {
  let id=preferred, suffix=2;
  while (question.blanks.some(b=>b.id===id)) id=`${preferred}_${suffix++}`;
  return id;
}
function addStemLine(question, value) {
  question.stem += `${question.stem ? "<br>" : ""}${value}`;
}
function namedBlankTokens(text) {
  const tokens=[];
  const converted=String(text || "").replace(/(\d+)\s*_{2,}/g,(whole,number)=>{
    tokens.push(`blank${number}`);
    return `[blank${number}]`;
  });
  return {converted,tokens};
}
function placeholderHtml(group) {
  if (!group?.requiresImage) return "";
  if (group.imageUrl) {
    const url=canonicalCdnImageUrl(group.imageUrl);
    if (url) return `<p><img style="display: block; margin-left: auto; margin-right: auto;" role="presentation" src="${esc(url)}" alt="" width="640" height="360" /></p>`;
  }
  return '<p><strong>[LXD IMAGE PLACEHOLDER — insert the shared labeled diagram before publishing]</strong></p>';
}
function finalStemHtml(question,group) {
  const heading=dom.includeHeading.checked ? `<h4><strong>${esc(group.title)}</strong></h4>` : "";
  return `${heading}${placeholderHtml(group)}${normalizeQuestionStemHtml(question.stem)}`;
}
function dropdownOptionsText(options) {
  return (options || []).map(o=>`${o.correct ? "*" : ""}${o.text}`).join(", ");
}
function parseDropdownOptions(text) {
  return String(text || "").split(",").map(t=>t.trim()).filter(Boolean).map(t=>({
    text:t.replace(/^\*+\s*/, ""),correct:/^\*/.test(t)
  }));
}

// Mammoth outputs Word automatic numbering as <ol><li>Question</li></ol>.
// The list number is NOT part of the <li> text, so it cannot be detected
// using a /^\\d+\\./ regex. Tables and feedback lists are independent sibling
// blocks, sometimes interrupted by a Word page break.
// v3.7: parse in two phases: first group and segment the real questions,
// then resolve the specific answer structure. Internal numbered prompts,
// answer keys, and instructor-only directions never create extra items.
let parseRunSequence = 0;
function qtiSourceEvents(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const events=[];
  const push=(html,kind="text",meta={})=>{
    // Preserve underscores here: they encode numbered dropdown blanks in Word.
    // They are cleaned only after the question type has been identified.
    const text=String(textFromHtml(html)).replace(/\s+/g," ").trim();
    if(text) events.push({html,text,kind,...meta});
  };
  for(const el of [...doc.body.children]){
    const tag=el.tagName.toLowerCase();
    if(tag==="table") {events.push({html:el.outerHTML,text:normalizeSpaces(el.textContent),kind:"table",element:el});continue;}
    if(tag==="ul"||tag==="ol") {
      const listStyle=(el.getAttribute("style")||"").toLowerCase();
      const letter=tag==="ol" && (/^[aA]$/.test(el.getAttribute("type")||"") || /list-style-type\s*:\s*(?:lower-alpha|upper-alpha|lower-latin|upper-latin)/.test(listStyle));
      const numbering=tag==="ol"&&!letter;
      let i=Number(el.getAttribute("start")||1)-1;
      for(const li of [...el.children].filter(x=>x.tagName.toLowerCase()==="li")){
        i++;
        let h=li.innerHTML.trim().replace(/^<p[^>]*>|<\/p>$/gi, "").trim();
        const fragments=h.split(/<br\s*\/?\s*>/i).map(t=>t.trim()).filter(Boolean);
        fragments.forEach((frag,j)=>{
          if(j===0){
            if(letter && !/^\*?\s*[A-Z][.)]/i.test(normalizeSpaces(textFromHtml(frag))))
              frag=`${String.fromCharCode((el.getAttribute("type")==="A"||/upper-(?:alpha|latin)/.test(listStyle)?65:97)+i-1)}. ${frag}`;
            if(numbering && !/^\d+\s*[.)]/.test(normalizeSpaces(textFromHtml(frag))))
              frag=`${i}. ${frag}`;
          }
          push(frag,letter?"letter-list":numbering?"numbered-list":"bullet",{listIndex:i});
        });
      }
      continue;
    }
    let h=blockInnerHtml(el);
    for(const segment of h.split(/<br\s*\/?\s*>/i)) push(segment.trim());
  }
  return events;
}
function qtiCleanLine(value){return normalizeSpaces(textFromHtml(value));}
function qtiQuestionStemCandidate(text){
  const value=String(text||"").replace(/^\s*\d+\s*[.)]\s*/,"").trim();
  return /^(?:match\b|select\b|place\b|using\b|which\b|what\b|how\b|identify\b|choose\b|complete\b|the client\b|a client\b|two clients\b|several clients\b|each of these\b|in the following\b)/i.test(value)
    || (/\?/.test(value) && /(?:client|medical|symptoms|substance|term|condition|structure|signs)/i.test(value));
}
function qtiNumberedValue(text) {
  const m=String(text||"").match(/^\s*(\d+)\s*[.)]\s*(.+)$/s);
  return m ? {index:Number(m[1]),value:m[2].trim()} : null;
}
function qtiStripQuestionNumber(html) {
  return String(html||"").replace(/^\s*\d+\s*[.)]\s*/,"").trim();
}
function qtiLetterTokens(text){
  // This is intentionally run on text, not raw HTML. It recognizes letters
  // separated by Word runs, semicolons and internal line breaks.
  const value=String(text||"").replace(/\u00a0/g," ");
  const rx=/(^|[\s;,])\s*(\*?)\s*([A-H])\s*[.)]\s*(\*?)\s*/gi;
  const matches=[...value.matchAll(rx)];
  const result=[];
  for(let i=0;i<matches.length;i++){
    const m=matches[i],begin=m.index+m[0].length;
    const next=matches[i+1];
    const end=next?next.index:value.length;
    const label=m[3].toUpperCase();
    const answer=value.slice(begin,end).trim().replace(/\s*[;,]\s*$/g,"");
    if(answer)result.push({label,text:answer,correct:!!(m[2]||m[4])});
  }
  return result;
}
function qtiHtmlWithoutChoicePrefix(html){
  // Preserve Word bold/italic/underline in a choice while stripping its
  // A./*B. answer marker, even when the marker spans multiple Word runs.
  const doc=new DOMParser().parseFromString(`<div id="qti-option">${html}</div>`,"text/html");
  const root=doc.getElementById("qti-option");
  const text=root.textContent || "";
  const prefix=text.match(/^\s*\*?\s*[A-H]\s*[.)]\s*\*?\s*/i);
  if(!prefix)return esc(text);
  let remaining=prefix[0].length;
  const walker=doc.createTreeWalker(root,4),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    if(!remaining)break;
    const value=node.nodeValue || "";
    const amount=Math.min(remaining,value.length);
    node.nodeValue=value.slice(amount);
    remaining-=amount;
  }
  for(const node of [...root.querySelectorAll("*")].reverse())
    if(!node.textContent?.trim() && !node.querySelector("img"))node.remove();
  return root.innerHTML.trim();
}
function qtiParseKey(text){
  return parseKeyEntries(String(text||"").replace(/^Correct\s+(?:Match|Matches|Answer|Answers)\s*:\s*/i,""));
}
function qtiFeedbackParts(value){
  return String(value||"").replace(/^\s*(?:Set|General)\s+Feedback\s*:?\s*/i,"").trim();
}
function qtiBlankModel(id,prompt,options){return {id,prompt,options:options||[]};}
// Production answer-key sections must never become part of a student-facing stem.
function removeAnswerKeyFromStem(html) {
  if (!html) return "";
  const doc=new DOMParser().parseFromString(`<div id="qti-safe-stem">${html}</div>`,"text/html");
  const root=doc.getElementById("qti-safe-stem");
  if (!root) return html;
  const bad=/^(?:Correct\s+(?:Answer|Answers|Match|Matches)|Answer\s+Key)\s*:/i;
  for (const child of [...root.querySelectorAll("p,li,div")]) {
    if (bad.test((child.textContent||"").trim())) child.remove();
  }
  // Also handle inline answer keys accidentally joined to text by Word runs.
  for (const node of [...root.childNodes]) {
    if (node.nodeType===3 && bad.test((node.nodeValue||"").trim())) node.remove();
  }
  // Remove inline keys even when a Word run fused the key with the prompt.
  const fullText=root.textContent||"";
  const mapping=/Correct\s+(?:Answers?|Matches?)\s*:\s*(?:[A-H]\s*(?:→|->|[-–—:])\s*\d+|\d+\s*(?:→|->|[-–—:])\s*[A-H])/i;
  const key=fullText.match(mapping);
  if(key){
    let toKeep=key.index;
    const walker=doc.createTreeWalker(root,4);
    let node;
    while((node=walker.nextNode())){
      const value=node.nodeValue||"";
      if(toKeep>value.length){toKeep-=value.length;continue;}
      const range=doc.createRange();range.setStart(node,toKeep);range.setEnd(root,root.childNodes.length);
      range.deleteContents();break;
    }
  }
  return root.innerHTML.trim();
}
function isAnswerKeyEvent(text) {
  return /^\s*(?:Correct\s+(?:Match|Matches|Answer|Answers)|Answer\s+Key)\s*:/i.test(text);
}
function parseLabeledMeanings(records, issue) {
  // Supports Options: A. Endoscopy / Meanings: 1. ... /
  // Correct answers: A → 3, B → 1, C → 2.
  const optionsAt=records.findIndex(e=>/^Options\s*:?/i.test(e.text));
  const meaningsAt=records.findIndex(e=>/^Meanings?\s*:?/i.test(e.text));
  const keyAt=records.findIndex(e=>isAnswerKeyEvent(e.text));
  if (optionsAt<0 || meaningsAt<=optionsAt || keyAt<=meaningsAt) return null;
  const opts=records.slice(optionsAt,meaningsAt);
  const meaningRows=records.slice(meaningsAt,keyAt);
  const options=opts.flatMap(e=>qtiLetterTokens(e.text.replace(/^Options\s*:?\s*/i,"")));
  const meaningEntries=meaningRows.flatMap(e=>{
    const t=e.text.replace(/^Meanings?\s*:?\s*/i,"");
    const m=qtiNumberedValue(t);
    return m?[m]:[];
  });
  const keyText=records.slice(keyAt).map(e=>e.text).join(" ");
  const keys=[...keyText.matchAll(/([A-H])\s*(?:→|->|[-–—:])\s*(\d+)\b/gi)]
    .map(m=>({letter:m[1].toUpperCase(),number:Number(m[2])}));
  const byNum=new Map(),byLetter=new Map(),mapping=new Map();
  for(const m of meaningEntries){
    if(byNum.has(m.index))issue(`Duplicate meaning number ${m.index}.`);
    byNum.set(m.index,m.value);
  }
  for(const opt of options){
    if(byLetter.has(opt.label))issue(`Duplicate answer option ${opt.label}.`);
    byLetter.set(opt.label,opt.text);
  }
  for(const key of keys){
    if(mapping.has(key.letter))issue(`Duplicate correct-answer key for ${key.letter}.`);
    mapping.set(key.letter,key.number);
  }
  const pairs=options.map(opt=>{
    const number=mapping.get(opt.label);
    if(number===undefined || !byNum.has(number))issue(`Missing correct meaning for option ${opt.label}.`);
    return {left:opt.text,right:byNum.get(number)||""};
  });
  if(!options.length)issue("No labeled Matching options could be identified.");
  if(!meaningEntries.length)issue("No numbered Matching meanings could be identified.");
  if(!keys.length)issue("Correct answers could not be resolved to meaning numbers.");
  if(mapping.size!==options.length)issue("Correct answers do not cover every Matching option.");
  return {pairs,meanings:meaningEntries,options,keys};
}
function parseMedicalTermsMatching(records, issue) {
  // Options: numbered definitions; Medical Terms: lettered answer pool;
  // Correct Answer(s): 1-A, 2-B, ... . None of these are a student stem.
  const optionsAt=records.findIndex(e=>/^Options\s*:?/i.test(e.text));
  const termsAt=records.findIndex(e=>/^Medical\s+Terms?\s*:?/i.test(e.text));
  const keyAt=records.findIndex(e=>isAnswerKeyEvent(e.text));
  if(optionsAt<0 || termsAt<=optionsAt) return null;
  const definitions=records.slice(optionsAt,termsAt).flatMap(e=>{
    const source=e.text.replace(/^Options\s*:?\s*/i,"");
    const n=qtiNumberedValue(source);return n?[n]:[];
  });
  const termEvents=records.slice(termsAt+1,keyAt<0?undefined:keyAt);
  const termPool=[];
  const seenLabels=new Set();
  for(const e of termEvents){
    const stripped=e.text.replace(/^Medical\s+Terms?\s*:?\s*/i,"");
    const explicit=qtiLetterTokens(stripped);
    if(explicit.length){
      termPool.push(...explicit);
      for(const option of explicit)seenLabels.add(option.label);
      continue;
    }
    // Mammoth often exports Word A., B., C. auto-numbered answer pools
    // as <ol><li> and emits numeric (1., 2., 3.) list labels.
    // The section heading + answer-key letters establish that these are
    // answer choices, not additional numbered question descriptions.
    if(e.kind==="numbered-list" && Number.isInteger(e.listIndex) && e.listIndex>0){
      const numbered=qtiNumberedValue(stripped);
      const value=numbered?.value || stripped;
      const label=String.fromCharCode(64+e.listIndex);
      if(e.listIndex<=26 && value && !seenLabels.has(label)){
        termPool.push({label,text:value,correct:false});
        seenLabels.add(label);
      }
    }
  }
  const keys=keyAt>=0 ? qtiParseKey(records.slice(keyAt).map(e=>e.text).join(" ")) : [];
  const byLetter=new Map(),byNumber=new Map();
  for(const item of termPool){
    if(byLetter.has(item.label))issue(`Duplicate medical-term answer label ${item.label}.`);
    byLetter.set(item.label,item.text);
  }
  for(const item of definitions){
    if(byNumber.has(item.index))issue(`Repeated description ${item.index}.`);
    byNumber.set(item.index,item.value);
  }
  const mapping=new Map();
  for(const item of keys){
    if(mapping.has(item.number))issue(`Duplicate Correct Answers mapping ${item.number}.`);
    mapping.set(item.number,item.letter);
  }
  if(!mapping.size)issue("Medical Terms Matching has no Correct Answers mapping.");
  if(!definitions.length)issue("Missing numbered Matching descriptions in Options.");
  if(!termPool.length)issue("Missing lettered answer choices for matching pairs.");
  const pairs=definitions.map(({index,value})=>{
    const target=mapping.get(index);
    if(!target || !byLetter.has(target))issue(`Answer mismatch for description ${index}.`);
    return {left:value,right:byLetter.get(target)||""};
  });
  if(mapping.size!==definitions.length)issue("Correct Answers count does not match descriptions.");
  for(const key of mapping.keys()) if(!byNumber.has(key))issue(`Correct Answers references absent description ${key}.`);
  return {pairs,distractors:termPool.filter(t=>![...mapping.values()].includes(t.label)).map(t=>t.text)};
}

// Extract an explicit row-to-letter mapping from teacher answer-key lines.
function matchingArrowKeys(records) {
  const keys=new Map();
  let inKey=false;
  for(const row of records) {
    if(isAnswerKeyEvent(row.text)) inKey=true;
    if(!inKey)continue;
    const raw=row.text.replace(/^\s*(?:Correct\s+(?:Answers?|Matches?)|Answer\s+Key)\s*:\s*/i,"");
    // Word bullet items and line breaks are separate events. A single event
    // may also contain multiple mappings separated by commas/semicolons.
    for(const fragment of raw.split(/\s*[;,]\s*/)) {
      const match=fragment.trim().match(/^(.+?)\s*(?:→|->)\s*([A-H])\b/i);
      if(match)keys.set(normalizeSpaces(match[1]).toLowerCase(),match[2].toUpperCase());
    }
  }
  return keys;
}

function friendlyDropdownLabel(blank,index) {
  const proposed=String(blank.prompt||"").trim();
  const generic=/^(?:blank\s*\d+|option\s*[A-Z0-9]+|select\s+(?:answer|option)|\[[a-z][a-z0-9_]*\])$/i;
  return proposed && !generic.test(proposed) ? proposed : `Option ${index+1}`;
}
function qtiNewQuestion(bank,serial,stem){
  return {id:`q_${bank.id}_${serial}`,groupId:bank.id,stem,choices:[],pairs:[],distractors:[],blanks:[],
    dropdownMode:"",sharedOptions:[],correctMatches:{},matchingNotes:[],internalNotes:[],
    matchingDescriptions:[],matchingOptionPool:[],matchingAnswerKey:[],
    type:"multiple_choice_question",feedback:"",points:"",itemTitle:"",status:"good",issues:[],
    parseIssues:[],sourceEvents:[]};
}
function qtiCompileQuestion(q,body,bank){
  const texts=body.map(e=>e.text);
  const all=texts.join("\n");
  const addIssue=(message,level="correction")=>q.parseIssues.push({level,text:message});
  const isTeacher=t=>/^(?:IST|BV\s+ticket)\s*:/i.test(t);
  const qtiOptionsHeader=/^Options\s*:?\s*$/i;
  const qtiKeyLabel=/^Correct\s+(?:Match|Matches|Answer|Answers)\s*:/i;
  const isFeedbackHeader=t=>/^(?:Feedback|Rationale)\s*:/i.test(t);
  const records=body.filter(e=>!isTeacher(e.text));
  const tableEvents=records.filter(e=>e.kind==="table");
  const metadata={};
  const optionsIndex=records.findIndex(e=>/^Options\s*:?/i.test(e.text));
  const keyIndex=records.findIndex(e=>qtiKeyLabel.test(e.text));
  const opts=optionsIndex>=0?records.slice(optionsIndex+1,keyIndex>=0?keyIndex:undefined):[];
  const beforeOpts=records.slice(0,optionsIndex>=0?optionsIndex:(keyIndex>=0?keyIndex:undefined));
  let keyText=keyIndex>=0?records.slice(keyIndex).map(e=>e.text).join(" "):"";
  const keyEntries=qtiParseKey(keyText);
  const optionRows=opts.map(e=>({text:e.text,numbered:qtiNumberedValue(e.text)}));
  const perRowOptions=optionRows.filter(e=>e.numbered && qtiLetterTokens(e.numbered.value).length>=2);
  const namedWordParts=/(?:Combining\s+forms?)\s*:/i.test(all)&&/(?:Suffixes?)\s*:/i.test(all);
  const hasNamedWordBlanks=/Combining\s+forms?\s*_{2,}\s*\+\s*Suffix\s*_{2,}/i.test(all);
  const hasBracketDropdowns=records.some(e=>!!dropdownInline(e.text));
  const hasNumberedBlank=/\b\d+\s*_{2,}/.test(all);
  const hasOrdering=body.some(e=>/IST\s*:\s*Correct\s+order\s+and\s+terms/i.test(e.text));
  const arrowLines=records.filter(e=>/^\s*.+?\s*(?:→|->)\s*[A-Z]\s*$/i.test(e.text));
  const matchingTables=tableEvents.map(e=>parseTable(e.element)).filter(Boolean);

  // Record answer-bearing IST instructions before hiding them from student view.
  for(const e of body) if(isTeacher(e.text))q.internalNotes.push(e.text);

  // 1. Sequencing exercise: the IST list is an answer key, not a question list.
  if(hasOrdering){
    q.type="matching_question";
    const at=body.findIndex(e=>/IST\s*:\s*Correct\s+order\s+and\s+terms/i.test(e.text));
    const terms=body.slice(at+1).map(e=>qtiNumberedValue(e.text)).filter(Boolean);
    const ordinals=["First","Second","Third","Fourth","Fifth","Sixth","Seventh","Eighth","Ninth","Tenth"];
    q.pairs=terms.map((item,i)=>({left:ordinals[i]||`Step ${i+1}`,right:item.value}));
    q.stem=`<p>${esc(qtiCleanLine(q.stem))}</p><p>Match each step with the correct medical term.</p>`;
    if(!q.pairs.length)addIssue("The IST ordering answer key contains no numbered terms.");
    if(terms.some((item,i)=>item.index!==i+1))addIssue("Ordering key contains missing or repeated position numbers.");
    return;
  }

  // 2. Table Matching, including fragments split across Word pages/tables.
  // Only answer-key-backed rows become pairs when coded options are shuffled.
  if(tableEvents.length){
    q.type="matching_question";
    const rows=matchingTables.flat();
    const keyed=matchingArrowKeys(records);
    const pool=new Map();
    const labeledRows=rows.filter(row=>extractLetter(row.right));
    for(const row of labeledRows){
      const letter=extractLetter(row.right),answer=stripOptionLabel(row.right);
      if(pool.has(letter) && pool.get(letter)!==answer)addIssue(`Conflicting answer text for label ${letter}.`);
      pool.set(letter,answer);
    }
    if(pool.size){
      if(!keyed.size)addIssue("Letter-coded Matching table has no Correct Answers mapping.");
      const matchedKeys=new Set();
      const matchedRows=[];
      for(const row of rows){
        const term=normalizeSpaces(row.left).toLowerCase();
        if(keyed.has(term)){
          const letter=keyed.get(term);
          if(!pool.has(letter))addIssue(`Answer mismatch for ${row.left}: option ${letter} is unavailable.`);
          matchedRows.push({left:row.left,right:pool.get(letter)||""});
          matchedKeys.add(term);
        } else if(row.header || (row.first && !extractLetter(row.right) && !matchedRows.length)) {
          // Verified structural header or unlabeled introductory first row:
          // no student-facing pair is created.
          q.excludedTableHeaders=(q.excludedTableHeaders||[]).concat([row.left]);
        } else {
          // An unmatched row may be a legitimate pair missing from the key.
          // Keep it in source/validation, never silently throw it away.
          q.unmatchedTableRows=(q.unmatchedTableRows||[]).concat([row]);
          addIssue(`Unmatched table row: ${row.left}. Check Correct Answers.`);
        }
      }
      for(const [term,letter] of keyed){
        if(!matchedKeys.has(term))addIssue(`Correct Answers references a missing table prompt: ${term}.`);
      }
      q.pairs=matchedRows;
      q.distractors=[...pool.entries()].filter(([letter])=>![...keyed.values()].includes(letter)).map(([,value])=>value);
      q.matchingNotes=[];
      q.internalNotes.push(...(q.excludedTableHeaders||[]).map(t=>`Excluded non-matching table header: ${t}`));
      if(keyed.size!==q.pairs.length)addIssue("Answer-key mapping count differs from Matching table pairs.");
    }else{
      // A table of explicitly paired values needs no separate answer key.
      // Avoid assuming that a row of headings is a valid association.
      q.pairs=rows.filter(row=>!row.header).map(row=>({left:row.left,right:row.right}));
      if(rows.some(row=>row.header))q.excludedTableHeaders=rows.filter(row=>row.header).map(row=>row.left);
      if(!q.pairs.length)addIssue("No matching rows could be identified.");
      if(q.pairs.length && !rows.some(row=>row.header) && !keyed.size)
        addIssue("No explicit answer key or structural table header. Confirm that each table row is a correct direct pair.","review");
      if(!rows.some(row=>row.header) && q.pairs.length &&
          /(?:Correct\s+(?:Answers?|Matches?)|Answer\s+Key)/i.test(all) && !keyed.size)
        addIssue("Matching key was present but could not be resolved to direct table pairs.");
    }
    if(q.pairs.length<2)addIssue("Matching table must contain at least two reliable pairs.");
    return;
  }

  // Lettered medical terms matched to numbered descriptions (the opposite
  // structure from diagnostic Options + Meanings).
  const medicalTermsMatching=parseMedicalTermsMatching(records,text=>addIssue(text));
  if(medicalTermsMatching){
    q.type="matching_question";
    q.pairs=medicalTermsMatching.pairs;
    q.distractors=medicalTermsMatching.distractors;
    q.matchingNotes=[];
    // Preserve any student-facing directions between the scenario opening and
    // the numbered Options block (e.g. "Match each term ..."). The source
    // answer pool and Correct Answers remain instructor-only.
    const directions=records.slice(0,optionsIndex).filter(e=>
      e.kind!=="table" && !isAnswerKeyEvent(e.text) &&
      !/^(?:Options|Medical\s+Terms?|Meanings?)\s*:?$/i.test(e.text));
    q.stem=removeAnswerKeyFromStem(`<p>${q.stem}</p>`+
      directions.map(e=>`<p>${e.html}</p>`).join(""));
    return;
  }

  // Matching of lettered diagnostic terms against numbered meanings.
  // The A→3 mapping is an ANSWER KEY, never student-facing content.
  const labeledMatching=parseLabeledMeanings(records,text=>addIssue(text));
  if(labeledMatching){
    q.type="matching_question";
    q.pairs=labeledMatching.pairs;
    q.distractors=[];
    q.stem=removeAnswerKeyFromStem(`<p>${q.stem}</p>`);
    q.matchingNotes=[]; // Keys stay internal; no inferred answer-key feedback.
    return;
  }

  // 3. Medical word building: independent combining-form and suffix pools.
  if(namedWordParts || hasNamedWordBlanks){
    q.type="multiple_dropdowns_question";q.dropdownMode="word-parts";
    const sets={combining_form:[],suffix:[]};
    let section=null;
    for(const row of records){
      const t=row.text;
      const f=t.match(/^(?:Combining\s+forms?|Suffixes?)\s*:\s*(.*)$/i);
      if(f){section=/^Combining/i.test(t)?"combining_form":"suffix";
        sets[section].push(...qtiLetterTokens(f[1]));continue;}
      if(section&&/^\s*\*?\s*[A-F][.)]/i.test(t))sets[section].push(...qtiLetterTokens(t));
    }
    const before=records.slice(0,optionsIndex<0?records.length:optionsIndex);
    const cleanLines=before.map(e=>e.text).filter(t=>!/^\s*Options\s*:/i.test(t));
    const text=cleanLines.join("\n");
    const numberedPhrase=text.match(/(.+?):\s*Combining\s+form\s*_{2,}\s*\+\s*Suffix\s*_{2,}/i);
    if(numberedPhrase){
      q.stem=`<p>${esc(qtiCleanLine(q.stem))}</p><p>${esc(numberedPhrase[1].trim())}: Combining form [combining_form] + Suffix [suffix]</p>`;
    }else{
      q.stem=`<p>${esc(qtiCleanLine(q.stem))}</p><p>Combining form [combining_form] + Suffix [suffix]</p>`;
    }
    q.blanks=[qtiBlankModel("combining_form","Combining form",sets.combining_form.map(o=>({text:o.text,correct:o.correct}))),
              qtiBlankModel("suffix","Suffix",sets.suffix.map(o=>({text:o.text,correct:o.correct})))];
    for(const blank of q.blanks){
      if(blank.options.length<2)addIssue(`${blank.prompt} options were not recognized.`);
      if(blank.options.filter(o=>o.correct).length!==1)addIssue(`${blank.prompt} requires exactly one marked correct answer.`);
    }
    return;
  }

  // 4. Multiple dropdowns with per-row (numbered) A/B/C option sets.
  if(perRowOptions.length){
    q.type="multiple_dropdowns_question";q.dropdownMode="per-row";
    const numberedPrompts=beforeOpts.map(e=>qtiNumberedValue(e.text)).filter(Boolean);
    const keyByNumber=new Map(keyEntries.map(k=>[k.number,k.letter]));
    const optionByNumber=new Map();
    for(const row of perRowOptions){
      const num=row.numbered.index;
      if(optionByNumber.has(num))addIssue(`Duplicate options for row ${num}.`);
      optionByNumber.set(num,qtiLetterTokens(row.numbered.value));
    }
    q.stem=`<p>${esc(qtiCleanLine(q.stem))}</p>`;
    q.blanks=[];
    for(const [i,prompt] of numberedPrompts.entries()){
      const num=prompt.index;
      const id=`blank${num}`,choices=optionByNumber.get(num)||[];
      const correct=keyByNumber.get(num);
      if(!correct)addIssue(`Correct Matches is missing row ${num}.`);
      if(!choices.some(o=>o.label===correct))addIssue(`Answer key ${correct||"(missing)"} is not an option for row ${num}.`);
      q.blanks.push(qtiBlankModel(id,prompt.value,choices.map(o=>({text:o.text,correct:o.label===correct}))));
      q.stem+=`<p>${esc(`${num}. ${prompt.value}`)} [${id}]</p>`;
    }
    if(!numberedPrompts.length)addIssue("No numbered prompts were detected for per-row dropdowns.");
    if(optionByNumber.size!==numberedPrompts.length)addIssue("The number of option rows does not match the prompts.");
    if(keyEntries.length!==numberedPrompts.length)addIssue("Correct Matches does not cover every dropdown.");
    return;
  }

  // 5. Inline per-label dropdown syntax (Label X: [*answer, distractor]).
  if(hasBracketDropdowns){
    q.type="multiple_dropdowns_question";q.dropdownMode="inline";
    q.stem=`<p>${esc(qtiCleanLine(q.stem))}</p>`;
    for(const row of records){
      const found=dropdownInline(row.text);
      if(!found)continue;
      const id=uniqueBlankId(q,normalBlankId(found.prompt,q.blanks.length+1));
      q.blanks.push(qtiBlankModel(id,found.prompt,found.options));
      q.stem+=`<p>${esc(found.prompt)} [${id}]</p>`;
    }
    return;
  }

  // 6. Numbered blanks + one shared answer pool; e.g. cardi/o reused.
  if(hasNumberedBlank){
    q.type="multiple_dropdowns_question";q.dropdownMode="pool";
    const choices=opts.flatMap(e=>qtiLetterTokens(e.text));
    const key=new Map(keyEntries.map(e=>[e.number,e.letter]));
    const text=beforeOpts.map(e=>e.text).join("\n");
    const tokens=namedBlankTokens(text);
    q.stem=`<p>${esc(qtiCleanLine(q.stem))}</p><p>${esc(tokens.converted).replace(/\n/g,"<br>")}</p>`;
    q.blanks=[];
    for(const id of [...new Set(tokens.tokens)]){
      const num=Number(id.replace("blank",""));
      const target=key.get(num);
      if(!target)addIssue(`Correct Matches is missing blank ${num}.`);
      q.blanks.push(qtiBlankModel(id,`Blank ${num}`,choices.map(o=>({text:o.text,correct:o.label===target}))));
    }
    if(!q.blanks.length)addIssue("Numbered dropdown blanks were not found.");
    if(choices.length<2)addIssue("Shared options were not recognized for dropdown blanks.");
    return;
  }

  // 7. Numbered descriptions + ONE shared A/B/C answer pool = Matching.
  if(optionsIndex>=0 && keyEntries.length){
    q.type="matching_question";
    const prompts=beforeOpts.map(e=>qtiNumberedValue(e.text)).filter(Boolean);
    const pool=opts.flatMap(e=>qtiLetterTokens(e.text));
    const byLabel=new Map();
    pool.forEach(opt=>{if(byLabel.has(opt.label))addIssue(`Repeated option label ${opt.label}.`);byLabel.set(opt.label,opt.text);});
    const key=new Map();
    keyEntries.forEach(e=>{if(key.has(e.number))addIssue(`Duplicate correct key for ${e.number}.`);key.set(e.number,e.letter);});
    q.pairs=prompts.map(prompt=>{
      const label=key.get(prompt.index);
      if(!label||!byLabel.has(label))addIssue(`Missing matching answer for description ${prompt.index}.`);
      return {left:prompt.value,right:byLabel.get(label)||""};
    });
    q.distractors=pool.filter(o=>!keyEntries.some(k=>k.letter===o.label)).map(o=>o.text);
    q.matchingNotes=q.pairs.filter(p=>p.right).map(p=>`<li>${esc(p.left)} → ${esc(p.right)}</li>`);
    if(!prompts.length)addIssue("Matching descriptions could not be detected.");
    if(prompts.length!==keyEntries.length)addIssue("Correct Matches count does not match numbered descriptions.");
    return;
  }

  // 8. Ordinary Multiple Choice / Multiple Answers. Process each answer label
  // independently of Word paragraph/list styling, and retain incomplete MC.
  q.stem=removeAnswerKeyFromStem(`<p>${q.stem}</p>`);
  q.choices=[];
  let current=null;
  for(const row of records){
    if (isAnswerKeyEvent(row.text)) continue;
    if (/^(?:Meanings?|Medical\s+Terms?|(?:Set|General)\s+Feedback)\s*:?$/i.test(row.text)) continue;
    if(isFeedbackHeader(row.text)){
      const content=row.text.replace(/^(?:Feedback|Rationale)\s*:?\s*/i,"").trim();
      if(content)q.feedback=[q.feedback,esc(content)].filter(Boolean).join("<br>");
      continue;
    }
    const choices=qtiLetterTokens(row.text);
    const startsWithChoice=/^\s*\*?\s*[A-H][.)]/i.test(row.text);
    if(startsWithChoice&&choices.length){
      for(const choice of choices){
        const optionHtml=choices.length===1 ? qtiHtmlWithoutChoicePrefix(row.html) : esc(choice.text);
        current={label:choice.label,html:optionHtml,correct:choice.correct};
        q.choices.push(current);
      }
    } else if(current && !qtiKeyLabel.test(row.text) && !qtiOptionsHeader.test(row.text)){
      current.html+=`<br>${row.html}`;
    } else if(!qtiOptionsHeader.test(row.text) && !isAnswerKeyEvent(row.text)){
      q.stem+=`<p>${row.html}</p>`;
    }
  }
  q.stem=removeAnswerKeyFromStem(q.stem);
  if(q.choices.filter(c=>c.correct).length>1)q.type="multiple_answers_question";
  // A source with only one choice stays incomplete rather than invented.
}
function parseHtmlToGroups(html,sourceName){
  const runId=++parseRunSequence;
  const events=qtiSourceEvents(html);
  const groupRx=/^(U\s*\d+)\s*[–—−-]\s*(L\s*\d+)\s*[–—−-]\s*Group\s*#?\s*(\d+)\s*[:–—−-]\s*(.+)$/i;
  const groups=[];
  let bank=null,current=null,questionSerial=0,feedbackMode=false,skipReferences=false;
  const unmatchedHeadings=[];
  let pendingHeading="";
  const finishQuestion=()=>{
    if(!bank||!current)return;
    qtiCompileQuestion(current,current.sourceEvents,bank);
    current.stem=normalizeQuestionStemHtml(removeAnswerKeyFromStem(current.stem));
    current.originalSnapshot=snapshotForUndo(current);
    bank.questions.push(current);current=null;
  };
  for(const event of events){
    const lineHeading=event.text.replace(/\u00a0/g," ").replace(/\s+/g," ").replace(/^#+\s*/,"").trim();
    const heading=(pendingHeading ? `${pendingHeading} ${lineHeading}` : lineHeading).trim();
    let title=groupRx.exec(heading);
    if(!title && !pendingHeading && /^(?:U\s*\d+\s*[–—−-]\s*L\s*\d+\s*[–—−-]\s*Group\s*\d+\s*[:–—−-]?\s*)$/i.test(lineHeading)) {
      pendingHeading=lineHeading;continue;
    }
    if(pendingHeading){
      pendingHeading="";
      if(!title){unmatchedHeadings.push(heading);if(bank)bank.parseIssues.push({level:"correction",text:`Unrecognized split group heading: ${heading.slice(0,100)}.`});continue;}
    }
    if(!title && /\bU\s*\d+\s*[–—-]\s*L\s*\d+\s*[–—-]\s*Group\s*\d+\b/i.test(heading)) {
      unmatchedHeadings.push(heading);
      if(bank)bank.parseIssues.push({level:"correction",text:`Unrecognized group heading: ${heading.slice(0,100)}.`});
      continue;
    }
    if(title){
      finishQuestion();
      bank={id:`bank_${runId}_${groups.length+1}_${sourceName.replace(/\W/g,"_")}`,sourceName,
        unit:title[1].toUpperCase().replace(/\s+/g,""),lesson:title[2].toUpperCase().replace(/\s+/g,""),number:Number(title[3]),title:title[4].trim(),
        feedback:"",questions:[],issues:[],parseIssues:[],status:"good",teacherNotes:[],requiresImage:false,imageUrl:"",forceDropdown:false,sourceNumberedQuestionCount:0};
      groups.push(bank);feedbackMode=false;skipReferences=false;questionSerial=0;continue;
    }
    if(!bank)continue;
    const text=event.text;
    if(dom.excludeReferences.checked&&/^References?\s*:?$/i.test(text)){skipReferences=true;continue;}
    if(skipReferences)continue;
    if(/^(?:set|general)\s+feedback\s*:?$/i.test(text)){
      bank.feedbackExpected=true;feedbackMode=true;continue;
    }
    const feedbackInline=text.match(/^(?:set|general)\s+feedback\s*:\s*(.+)$/i);
    if(feedbackInline){bank.feedbackExpected=true;bank.feedback=[bank.feedback,esc(feedbackInline[1])].filter(Boolean).join("<br>");feedbackMode=true;continue;}
    const isIST=/^(?:IST|BV\s+ticket)\s*:/i.test(text);
    if(isIST){
      bank.teacherNotes.push(text);
      if(/image.*(?:all questions|each question|this set)|placeholder.*image/i.test(text))bank.requiresImage=true;
      if(/drop[- ]?downs?|drop down/i.test(text))bank.forceDropdown=true;
      if(current)current.sourceEvents.push(event); // Answer-bearing ordering IST retained internally.
      continue;
    }
    const numbered=qtiNumberedValue(text);
    const candidate=qtiQuestionStemCandidate(text);
    const numberedSentence=!!numbered && numbered.value.length>=45 &&
      /\b(?:client|patient|select|match|identify|choose|correct|diagnos|medical term|word part|symptom|condition|procedure|question)\b/i.test(numbered.value) &&
      !/^(?:Options|Medical\s+Terms|Meanings|Correct\s+(?:Answers?|Matches?))\b/i.test(numbered.value) &&
      !/\b\d+\s*_{2,}/.test(numbered.value);
    const priorHasKey=current && current.sourceEvents.some(e=>isAnswerKeyEvent(e.text));
    const priorHasChoices=current && current.sourceEvents.some(e=>
      e.kind==="table" || /^\s*\*?\s*[A-H][.)]/i.test(e.text) ||
      (e.kind==="letter-list" && qtiLetterTokens(e.text).length));
    // PARSER-033: Distinguish a genuine, numbered *question stem* from
    // numbered answers, ordering terms and Matching descriptions. Outer stems
    // often appear immediately after an IST ordering list or inline dropdown
    // choices, where there is no `Correct Answers:` section to look back at.
    // Requiring a preceding answer key caused v3.10 to merge 3 questions into
    // one (Intestines, Order of Digestion and both Digestive Word Parts banks).
    // Conversely, accepting every long numbered sentence split Heart Conditions
    // descriptions into phantom questions in v3.9. Only explicitly question-
    // shaped NUMBERED openings may start a new item without previous-key proof.
    const explicitNumberedStem=!!numbered && candidate &&
      /^(?:select|match|place|which|what|how|identify|choose|complete|using|a client|the client|two clients|several clients|each of these|in the following)\b/i.test(numbered.value);
    // PARSER-033: do not treat an internal numbered instruction as the next
    // question unless the preceding question has yielded an answer block.
    // Distinguish an IST ordering list and bracketed dropdown option pool
    // from numbered Matching descriptions: the latter are NOT answer keys.
    const priorEvents=current?.sourceEvents||[];
    const priorHasDropdownOptions=priorEvents.some(e=>
      /\[[^\]\n]*(?:,|;)[^\]\n]*\]/.test(e.text) ||
      /^(?:Combining\s+forms?|Suffixes?)\s*:\s*.*[A-H]\s*[.)]/i.test(e.text));
    const orderNoteAt=priorEvents.findIndex(e=>/^IST\s*:\s*Correct\s+order\s+and\s+terms/i.test(e.text));
    const priorHasOrderedTerms=orderNoteAt>=0 && priorEvents.slice(orderNoteAt+1).some(e=>!!qtiNumberedValue(e.text));
    const previousQuestionCompleted=priorHasKey||priorHasChoices||priorHasDropdownOptions||priorHasOrderedTerms;
    if(event.kind!=="table" && explicitNumberedStem)bank.sourceNumberedQuestionCount++;
    const isNewQuestion=event.kind!=="table" && (candidate||numberedSentence) && (
      !current || (previousQuestionCompleted && (numbered ? (explicitNumberedStem||numberedSentence) : candidate)));
    // If the source repeats a plausible outer number before the preceding
    // answer pool exists, retain the content rather than dropping it. Mark
    // the ambiguous split for human review.
    if(current && numbered && explicitNumberedStem && numbered.index===questionSerial+1 && !previousQuestionCompleted){
      if(!current.parseIssues.some(i=>i.code==="question_boundary_ambiguous"))
        current.parseIssues.push({level:"review",code:"question_boundary_ambiguous",
          text:"We couldn't confirm where this question starts or ends. Please review the question."});
    }
    const numberedOpening=!!numbered && (candidate||numberedSentence);
    const standaloneUnnumbered=/\?/.test(text) && /^(?:Which|What|How|Select|Identify|Match|Choose|A client|The client)\b/i.test(text);
    const realOpeningInFeedback=event.kind!=="table" && (numberedOpening || (bank.feedback && standaloneUnnumbered));
    if(feedbackMode){
      if(!realOpeningInFeedback){
        if(text.length<=3 && !bank.feedback){
          bank.parseIssues.push({level:"review",text:`Unrecognized short text after set feedback: ${text}. Confirm whether it belongs in the feedback.`});
        }else bank.feedback=[bank.feedback,event.html].filter(Boolean).join("<br>");
        continue;
      }
      feedbackMode=false;
    }
    if(isNewQuestion){
      finishQuestion();
      const stem=numbered?qtiStripQuestionNumber(event.html):event.html;
      current=qtiNewQuestion(bank,++questionSerial,stem);
      if(!numbered && questionSerial>1)current.parseIssues.push({level:"review",code:"question_boundary",text:"Unnumbered question boundary identified from the question text. Confirm the split."});
      continue;
    }
    if(current){current.sourceEvents.push(event);continue;}
    // Do not invent questions from headings, feedback or instructions.
    if(text.length>3)bank.parseIssues.push({level:"review",text:`Content before first question was not classified: ${text.slice(0,120)}`});
  }
  finishQuestion();
  // A safety check independent of the created questions: a future boundary
  // regression must not silently merge numbered questions into one item.
  // Check only at initial import; intentional manual deletions remain possible.
  for(const g of groups){
    if(g.sourceNumberedQuestionCount>=2 && g.questions.length<g.sourceNumberedQuestionCount)
      g.parseIssues.push({level:"correction",code:"possible_question_merge",
        text:`Possible question merge: ${g.sourceNumberedQuestionCount} numbered question openings were found, but only ${g.questions.length} question(s) were created.`});
  }
  // A missing/empty group must remain visible with a critical warning; do not
  // make it disappear from Step 2 solely because it contains no questions.
  const numberingSets=new Map();
  for(const group of groups){
    const key=`${group.sourceName}|${group.unit}|${group.lesson}`;
    if(!numberingSets.has(key))numberingSets.set(key,[]);
    numberingSets.get(key).push(group);
  }
  for(const siblings of numberingSets.values()){
    const nums=[...new Set(siblings.map(g=>g.number))].sort((a,b)=>a-b);
    for(let n=nums[0]+1;n<nums[nums.length-1];n++)if(!nums.includes(n)){
      siblings[0].parseIssues.push({level:"review",text:`Group numbering gap: Group ${n} was not detected in ${siblings[0].unit} ${siblings[0].lesson}. Check the source.`});
    }
  }
  if(pendingHeading)unmatchedHeadings.push(pendingHeading);
  if(unmatchedHeadings.length){
    // Preserve an inspectable source section and block export; no silent omission.
    groups.push({id:`bank_${runId}_unrecognized_${sourceName.replace(/\W/g,"_")}`,
      sourceName,unit:"SOURCE",lesson:"CHECK",number:0,title:"Unrecognized group heading(s)",
      feedback:"",questions:[],issues:[],status:"correction",parseIssues:unmatchedHeadings.map(h=>({level:"correction",text:`Unrecognized group heading: ${h.slice(0,160)}`})),
      teacherNotes:[],requiresImage:false,imageUrl:"",forceDropdown:false});
  }
  if(!groups.length && events.length){
    groups.push({id:`bank_${runId}_no_headings_${sourceName.replace(/\W/g,"_")}`,
      sourceName,unit:"SOURCE",lesson:"CHECK",number:0,title:"No recognized group headings",
      feedback:"",questions:[],issues:[],status:"correction",parseIssues:[{level:"correction",text:"No U/L/Group headings were recognized in the source document."}],
      teacherNotes:[],requiresImage:false,imageUrl:"",forceDropdown:false});
  }
  for(const group of groups)for(const [i,q] of group.questions.entries()){
    q.index=i+1;q.itemTitle=questionTitleFromGroupTitle(group.title,i+1);
  }
  return groups;
}

function safeFeedbackHtml(source) {
  const value=String(source || "").trim();
  if(!value)return "";
  if(!/<[a-z][^>]*>/i.test(value))return esc(value).replace(/\r?\n/g,"<br>");
  const doc=new DOMParser().parseFromString(`<div id="safe-feedback">${value}</div>`,"text/html");
  const root=doc.getElementById("safe-feedback");
  const allowed=new Set(["P","BR","STRONG","B","EM","I","U","UL","OL","LI"]);
  const walk=node=>{
    for(const child of [...node.children]){
      const tag=child.tagName;
      walk(child);
      if(!allowed.has(tag)){child.replaceWith(...child.childNodes);continue;}
      for(const attr of [...child.attributes])child.removeAttribute(attr.name);
    }
  };
  walk(root);
  return root.innerHTML;
}

function generalFeedbackHtml(question, group) {
  // Inferred matching keys are instructor-only. Include Matching explanations
  // ONLY when manually edited/confirmed as explicitly authored feedback.
  const notes=question.matchingNotesAuthored && question.matchingNotes?.length
    ? `<ul>${question.matchingNotes.join("")}</ul>` : "";
  return [question.feedback,notes,group.feedback]
    .filter(Boolean).map(html=>removeAnswerKeyFromStem(html)).filter(Boolean).join("<br><br>");
}

function revalidateAll() {
  state.groups.forEach(group => {
    group.questions.forEach((question, index) => validateQuestion(group, question, index));
    validateGroup(group);
  });
  const titles=new Map();
  for(const group of state.groups){
    const title=`${group.unit} – ${group.lesson} – Group ${group.number}: ${group.title}`.toLowerCase();
    if(titles.has(title)){
      for(const duplicate of [titles.get(title),group]){
        if(!duplicate.issues.some(i=>i.text==="Duplicate bank title across files."))
          duplicate.issues.push({level:"correction",text:"Duplicate bank title across files."});
        duplicate.status="correction";
      }
    } else titles.set(title,group);
  }
}

function validateQuestion(group, question, index) {
  question.index = index + 1;
  if (!question.customTitle) question.itemTitle = questionTitleFromGroupTitle(group.title, index + 1);
  // VALID-034: Manual sign-off resolves ONLY parser uncertainty. It must not
  // remove substantive errors (missing correct answers, malformed Matching,
  // empty blanks, pending image dependencies, etc.).
  question.issues = (question.parseIssues || []).filter(issue=>
    !(question.reviewConfirmed && isManualReviewIssue(issue)));
  if (question.draft) question.issues.push({level:"review",text:"Draft saved. Review the question and select Save Changes when finished."});

  const type = question.type;
  const stemText = textFromHtml(question.stem);
  if (!stemText) question.issues.push({ level: "correction", text: "Question stem is empty." });

  if (["multiple_choice_question", "multiple_answers_question", "true_false_question"].includes(type)) {
    if (type === "true_false_question" && question.choices.length === 0) {
      question.choices = [
        { label: "A", html: "True", correct: false },
        { label: "B", html: "False", correct: false }
      ];
    }

    if (question.choices.length < 2) {
      question.issues.push({ level: "correction", text: "Question has fewer than two answer choices." });
    }

    if (type === "true_false_question") {
      if (question.choices.length !== 2 || !["true","false"].every(answer => question.choices.some(c=>textFromHtml(c.html).toLowerCase().trim()===answer)))
        question.issues.push({level:"correction",text:"True / False requires exactly True and False choices."});
    }
    const correctCount = question.choices.filter(choice => choice.correct).length;
    if (correctCount === 0) {
      question.issues.push({ level: "correction", text: "No correct answer is marked." });
    }

    if (["multiple_choice_question","true_false_question"].includes(type) && correctCount > 1) {
      question.issues.push({ level: "correction", text: "This question type requires exactly one correct choice." });
    }
    if (type === "multiple_answers_question" && correctCount < 2) {
      question.issues.push({ level: "correction", text: "Multiple Answers requires at least two correct choices." });
    }

    const duplicates = new Set();
    question.choices.forEach(choice => {
      const key = normalizeSpaces(textFromHtml(choice.html)).toLowerCase();
      if (key) {
        if (duplicates.has(key)) {
          question.issues.push({ level: "review", text: "Duplicate answer choices were detected." });
        }
        duplicates.add(key);
      }
    });
  } else if (type === "multiple_dropdowns_question") {
    if (!question.blanks?.length) question.issues.push({level:"correction",text:"No dropdown blanks detected."});
    const unique=new Set();
    for (const blank of question.blanks || []) {
      if (!/^[a-z][a-z0-9_]*$/i.test(blank.id)) question.issues.push({level:"correction",text:`Invalid blank ID: ${blank.id}.`});
      if (unique.has(blank.id)) question.issues.push({level:"correction",text:`Repeated blank ID: ${blank.id}.`});
      unique.add(blank.id);
      if (!question.stem.includes(`[${blank.id}]`)) question.issues.push({level:"correction",text:`Stem is missing the [${blank.id}] placeholder.`});
      if ((blank.options||[]).length < 2) question.issues.push({level:"correction",text:`Dropdown ${blank.id} has fewer than 2 options.`});
      const correct=(blank.options||[]).filter(o=>o.correct);
      if (correct.length !== 1) question.issues.push({level:"correction",text:`Dropdown ${blank.id} requires exactly one correct option (found ${correct.length}).`});
      if (new Set((blank.options||[]).map(o=>o.text.toLowerCase().trim())).size !== (blank.options||[]).length) question.issues.push({level:"correction",text:`Dropdown ${blank.id} contains duplicate options.`});
    }
    if (group.requiresImage && !canonicalCdnImageUrl(group.imageUrl || "")) question.issues.push({level:"review",text:"Shared diagram is pending: LXD must insert the image before publishing."});
  } else if (type === "matching_question") {
    if (question.pairs.length < 2) {
      question.issues.push({ level: "correction", text: "Matching question must contain at least two pairs." });
    }
    const seenTerms = new Set();
    question.pairs.forEach((pair, pairIndex) => {
      const key = normalizeSpaces(pair.left).toLowerCase();
      if (key && seenTerms.has(key)) question.issues.push({level:"correction",text:`Matching term repeated: ${pair.left}.`});
      seenTerms.add(key);
      if (!normalizeSpaces(pair.left) || !normalizeSpaces(pair.right)) {
        question.issues.push({ level: "correction", text: `Matching pair ${pairIndex + 1} is incomplete.` });
      }
    });
  } else {
    question.issues.push({ level: "correction", text: `Unsupported question type: ${type}.` });
  }

  const individualPoints = question.points === "" || question.points === undefined
    ? Number(dom.defaultPoints.value) : Number(question.points);
  if (!Number.isFinite(individualPoints) || individualPoints <= 0) question.issues.push({level:"correction",text:"Points must be a positive number."});
  // Feedback and rationale are optional; absence is not a QA issue.

  question.status = resolveStatus(question.issues);
}

function validateGroup(group) {
  group.issues = [...(group.parseIssues || [])];
  if(group.feedbackExpected && !group.feedback.trim())group.issues.push({level:"correction",text:"The source declares Set Feedback, but its content was not imported."});
  if (group.requiresImage && !canonicalCdnImageUrl(group.imageUrl || "")) group.issues.push({level:"review",text:"Shared labeled image requested by IST; LXD placeholder is not yet replaced."});
  const qPerSet = Number(dom.questionsPerSet.value || 0);
  if (qPerSet && group.questions.length !== qPerSet) {
    group.issues.push({ level: "review", text: `Expected ${qPerSet} question(s), but found ${group.questions.length}.` });
  }
  if (!group.questions.length) {
    group.issues.push({ level: "correction", text: "Group contains no questions." });
  }
  group.questions.forEach(question => {
    if (question.status === "correction") {
      group.issues.push({ level: "correction", text: `${question.itemTitle} contains critical issues.` });
    } else if (question.status === "review") {
      group.issues.push({ level: "review", text: `${question.itemTitle} needs review.` });
    }
  });

  group.status = resolveStatus(group.issues);
}

function resolveStatus(issues) {
  if (issues.some(issue => issue.level === "correction")) return "correction";
  if (issues.some(issue => issue.level === "review")) return "review";
  return "good";
}
function friendlyValidationMessage(raw) {
  const issue=typeof raw==="string"?{text:raw}:raw||{};
  const text=String(issue.text||"");
  const lower=text.toLowerCase();
  if(issue.code==="question_boundary" || /unnumbered question boundary|confirm the split/.test(lower))
    return "We couldn't confirm where this question starts or ends. Please review the question.";
  if(/missing lettered|medical terms answer choices|no labeled matching options/.test(lower))
    return "Missing lettered answer choices for matching pairs. Please review the answer choices.";
  if(/description|matching pair|matching row/.test(lower) && /missing|incomplete|no |fewer|could not|does not match/.test(lower))
    return "Some matching pairs couldn't be completed. Please review the descriptions and answers.";
  if(/correct answers|correct matches|answer mismatch|answer key|mapping|option.*unavailable/.test(lower))
    return "We couldn't verify some correct answers. Please review the answer choices and answer key.";
  if(/no correct answer|correct choice|correct option|correct answer is marked/.test(lower))
    return "Please select the correct answer for this question.";
  if(/question has fewer|choices were not recognized|option.*fewer/.test(lower))
    return "Some answer choices are missing. Please review the question and its answers.";
  if(/feedback/.test(lower))
    return "We couldn't validate the feedback provided. Please review it.";
  if(/draft/.test(lower))return "Draft saved. Select Save Changes when you're ready to finish this question.";
  if(/group numbering gap/.test(lower))return "Some group numbers were skipped. Please check that all expected groups were imported.";
  if(/could not|unrecognized|not classified/.test(lower))
    return "We couldn't fully validate this question. Please review the question text, answers, and question type.";
  return text;
}
function isBoundaryReviewIssue(issue){
  return issue?.code==="question_boundary" || /unnumbered question boundary|confirm the split/i.test(issue?.text||"");
}
// Review-only ambiguity can be acknowledged after checking the answers.
// Group dependencies such as an unpublished image are intentionally excluded.
function isManualReviewIssue(issue){
  if(!issue || issue.level!=="review")return false;
  return isBoundaryReviewIssue(issue) || issue.code==="question_boundary_ambiguous" ||
    /no explicit answer key or structural table header|confirm that each table row is a correct direct pair/i.test(issue.text||"");
}
function hasManualReviewIssue(question){
  return (question.parseIssues||[]).some(isManualReviewIssue);
}
function reconcileManualParserIssues(question,structureChanged) {
  if(!structureChanged)return;
  const validMatching=question.type==="matching_question" && question.pairs.length>=2 &&
    question.pairs.every(p=>normalizeSpaces(p.left)&&normalizeSpaces(p.right));
  const validOther=question.type==="multiple_dropdowns_question" ?
    question.blanks.length>0 && question.blanks.every(b=>(b.options||[]).filter(o=>o.correct).length===1 && b.options.length>=2) :
    question.choices.length>=2 && question.choices.some(c=>c.correct);
  if(!validMatching&&!validOther)return;
  question.parseIssues=(question.parseIssues||[]).filter(issue=>{
    // A modified answer is not automatically a confirmed answer. Retain
    // parser review warnings until the user explicitly verifies the question.
    if(isManualReviewIssue(issue))return true;
    // Once a user has actually repaired all required answer fields, parser
    // diagnostics tied to the old answer structures are no longer current.
    return !/matching|description|correct answers|correct matches|option|answer.*key|unmatched|dropdown|blank/i.test(issue.text||"");
  });
}

const ISSUE_TAGS=[
  {id:"answer_mismatch",label:"Answer Mismatch"},
  {id:"missing_descriptions",label:"Missing Descriptions"},
  {id:"no_correct_answer",label:"No Correct Answer"},
  {id:"missing_answer_choices",label:"Missing Answer Choices"}
];
function issueTagsForQuestion(group,question){
  const tags=new Set();
  const issues=(question.issues||[]).map(i=>i.text).join(" ").toLowerCase();
  if(/answer mismatch|unmatched table row|matching.*key|correct answers (?:count|references)|correct matches count|no valid matching|duplicate.*label|missing or invalid key|option.*unavailable|mapping count|answer.key mapping/i.test(issues))
    tags.add("answer_mismatch");
  if(question.type==="matching_question" &&
      (question.pairs.length<2 || question.pairs.some(p=>!normalizeSpaces(p.left)) ||
       /missing.*description|description.*missing|no numbered matching descriptions/i.test(issues)))
    tags.add("missing_descriptions");
  const missing=question.type==="matching_question" ? !question.pairs.length || question.pairs.some(p=>!normalizeSpaces(p.right)) :
    question.type==="multiple_dropdowns_question" ? !question.blanks.length || question.blanks.some(b=>(b.options||[]).filter(o=>o.correct).length!==1) :
    !(question.choices||[]).some(c=>c.correct);
  if(missing || /no correct answer|requires exactly one correct|requires at least two correct/i.test(issues))
    tags.add("no_correct_answer");
  if(question.type==="matching_question" && /missing lettered|missing.*answer choices|no labeled matching options/i.test(issues))
    tags.add("missing_answer_choices");
  return tags;
}
function clearAllQuestionFilters(){
  state.search="";state.filter="all";state.questionTypeFilter="all";
  state.issueFilter="all";state.feedbackFilter="all";
  dom.searchBox.value="";dom.questionTypeFilter.value="all";
  document.querySelectorAll(".filter-card").forEach(el=>el.classList.toggle("active",el.dataset.filter==="all"));
  renderAll();
}
function renderIssueFilterBars(){
  const questions=state.groups.flatMap(g=>g.questions.map(q=>({g,q})));
  const counts=new Map(ISSUE_TAGS.map(t=>[t.id,questions.filter(({g,q})=>issueTagsForQuestion(g,q).has(t.id)).length]));
  for(const bar of dom.issueFilterBars){
    bar.innerHTML=ISSUE_TAGS.map(t=>`<button type="button" class="issue-chip ${t.id===state.issueFilter?"selected":""}" data-issue="${t.id}" aria-pressed="${t.id===state.issueFilter}">${esc(t.label)} <span class="issue-count">${counts.get(t.id)}</span></button>`).join("");
  }
  document.querySelectorAll(".feedback-filter").forEach(select=>select.value=state.feedbackFilter||"all");
}
document.querySelectorAll(".issue-filter-bar").forEach(bar=>bar.addEventListener("click",event=>{
  const chip=event.target.closest("[data-issue]");if(!chip)return;
  state.issueFilter=chip.dataset.issue===state.issueFilter?"all":chip.dataset.issue;
  renderAll();
}));
document.querySelectorAll(".issue-clear-filters").forEach(btn=>btn.addEventListener("click",clearAllQuestionFilters));
document.querySelectorAll(".feedback-filter").forEach(select=>select.addEventListener("change",()=>{
  state.feedbackFilter=select.value;renderAll();
}));
function matchesSearch(group, question) {
  if (!state.search) return true;
  const content = [group.title, `${group.unit} ${group.lesson} Group ${group.number}`,
    question.itemTitle, textFromHtml(question.stem),
    ...(question.choices||[]).map(c=>textFromHtml(c.html)),
    ...(question.pairs||[]).flatMap(p=>[p.left,p.right]),
    ...(question.blanks||[]).flatMap(b=>[b.prompt,b.id,...b.options.map(o=>o.text)])
  ].join(" ").toLowerCase();
  return content.includes(state.search);
}
function matchesFilters(group, question) {
  return (state.filter === "all" || question.status === state.filter) &&
    (state.questionTypeFilter === "all" || questionCategory(question) === state.questionTypeFilter) &&
    (state.issueFilter === "all" || issueTagsForQuestion(group,question).has(state.issueFilter)) &&
    (state.feedbackFilter !== "no_feedback" || !generalFeedbackHtml(question,group).trim()) &&
    matchesSearch(group, question);
}
function visibleGroups() {
  return state.groups.filter(group => !group.questions.length ? state.issueFilter === "all" && state.feedbackFilter !== "no_feedback" && state.filter === "all" && state.questionTypeFilter === "all" && matchesSearch(group,{itemTitle:"",stem:"",choices:[],pairs:[],blanks:[]}) : group.questions.some(question => matchesFilters(group,question)));
}
function filteredQuestions() {
  const groups = visibleGroups();
  const activeGroup = groups.find(g=>g.id===state.selectedBankId) || groups[0];
  if (!activeGroup) return {group:null,items:[]};
  return {group:activeGroup,items:activeGroup.questions.filter(q=>matchesFilters(activeGroup,q))};
}

function renderAll() {
  renderIssueFilterBars();
  renderCounts();
  renderBankList();
  renderQuestionList();
  renderEditor();
  renderPreview();
  renderValidationPanel();
  renderFiles();
  renderSummaryOverview();
}

function renderSummaryOverview() {
  const questions=state.groups.flatMap(group=>group.questions);
  const corrected=questions.filter(q=>q.status==="correction").length;
  const review=questions.filter(q=>q.status==="review").length;
  const groupsWithErrors=state.groups.filter(g=>g.status==="correction").length;
  dom.setupBankCount.textContent=state.groups.length;
  dom.setupQuestionCount.textContent=questions.length;
  const defaultPoints=Number(dom.defaultPoints.value || 0);
  const points=questions.reduce((sum,q)=>sum+Number(q.points || defaultPoints),0);
  dom.setupPointCount.textContent=Number.isFinite(points) ? +points.toFixed(2) : "—";
  dom.setupGood.textContent=questions.filter(q=>q.status==="good").length;
  dom.setupReview.textContent=review;
  dom.setupCorrection.textContent=corrected;
  dom.reviewTabCount.textContent=questions.length;
  dom.goReviewBtn.disabled=!questions.length;
  dom.downloadReportBtn.disabled=!state.validation;
  if (!questions.length){
    dom.validationState.textContent="Not analyzed";
    dom.setupValidationMessage.innerHTML="Upload a Word file and select <strong>Analyze files</strong> to see the results.";
  } else if (!state.validation) {
    dom.validationState.textContent="Validation needed";
    dom.setupValidationMessage.textContent=corrected || groupsWithErrors ? `${corrected} question(s) and ${groupsWithErrors} bank(s) contain critical issues. Open Question Review to correct them, then run validation.` : review ? `${review} question(s) may need review. Inspect them or run validation.` : "Analysis complete. Run validation before exporting.";
  } else {
    dom.validationState.textContent=(corrected || groupsWithErrors) ? "Corrections needed" : review ? "Review warnings" : "Validated";
    dom.setupValidationMessage.textContent=(corrected || groupsWithErrors) ? `Validation found ${corrected} question(s) and ${groupsWithErrors} bank(s) with critical issues. Export remains unavailable.` : review ? `Validation completed with ${review} review warning(s). Check the Question Review tab before export.` : "Validation passed. The package is ready for export.";
  }
}

function renderCounts() {
  const questions = state.groups.flatMap(group => group.questions);
  const counts = {
    all: questions.length,
    good: questions.filter(q => q.status === "good").length,
    review: questions.filter(q => q.status === "review").length,
    correction: questions.filter(q => q.status === "correction").length
  };
  dom.countAll.textContent = counts.all;
  dom.countGood.textContent = counts.good;
  dom.countReview.textContent = counts.review;
  dom.countCorrection.textContent = counts.correction;
  dom.bankCountPill.textContent = `${state.groups.length} bank${state.groups.length === 1 ? "" : "s"}`;

  const hasData = questions.length > 0;
  dom.validateBtn.disabled = !hasData;
  const canExport = hasData && !!state.validation && !state.groups.some(g=>g.status === "correction") && !questions.some(q=>q.draft);
  dom.exportBtn.disabled = !canExport;
  dom.reviewExportBtn.disabled = !canExport;
  dom.reviewValidateBtn.disabled = !hasData;
  const correctionCount = state.groups.filter(g => g.status === "correction").length;
  dom.reviewExportNotice.className = "review-export-notice" + (correctionCount ? " correction" : canExport ? " ready" : "");
  dom.reviewExportNotice.textContent = !hasData
    ? "Analyze Word files to begin."
    : correctionCount
      ? "Correct the flagged questions or banks before exporting."
      : canExport
        ? `Validation complete. Export the ${dom.outputMode.selectedOptions[0].textContent.toLowerCase()} using the same settings as Setup.`
        : "Run validation to enable QTI export. Optional feedback does not cause a warning.";
  dom.resultCount.textContent = `${state.groups.reduce((n,g)=>n+g.questions.filter(q=>matchesFilters(g,q)).length,0)} matching`;
  dom.currentFilterLabel.textContent = state.issueFilter !== "all" ? ISSUE_TAGS.find(t=>t.id===state.issueFilter)?.label : (state.feedbackFilter==="no_feedback" ? "No Feedback" : (state.filter === "all" ? "All statuses" : state.filter === "good" ? "Good" : state.filter === "review" ? "Needs Review" : "Needs Correction"));
}

function bankBadgeMarkup(group) {
  const counts = {
    good: group.questions.filter(q => q.status === "good").length,
    review: group.questions.filter(q => q.status === "review").length,
    correction: group.questions.filter(q => q.status === "correction").length
  };
  return `
    <div class="badge-row">
      <span class="badge ${group.status}">${group.status === "good" ? "Good" : group.status === "review" ? "Needs Review" : "Needs Correction"}</span>
      ${counts.good ? `<span class="badge good">${counts.good} good</span>` : ""}
      ${counts.review ? `<span class="badge review">${counts.review} review</span>` : ""}
      ${counts.correction ? `<span class="badge correction">${counts.correction} correction</span>` : ""}
    </div>
  `;
}

function renderBankList() {
  if (!state.groups.length) {
    dom.bankList.innerHTML = "No banks analyzed yet.";
    return;
  }
  const groups = visibleGroups();
  if (!groups.length) {
    state.selectedBankId=null; state.selectedQuestionId=null;
    dom.bankList.innerHTML = `<div class="empty-state">No banks match the selected filters.</div>`;
    return;
  }
  if (!groups.some(g => g.id === state.selectedBankId)) {
    state.selectedBankId = groups[0].id;
  }
  dom.bankList.innerHTML = groups.map(group => `
    <div class="bank-card ${group.id === state.selectedBankId ? "active" : ""}" data-bank-id="${group.id}">
      <div class="bank-card-title">${esc(group.unit)} – ${esc(group.lesson)} – Group ${group.number}: ${esc(group.title)}</div>
      <div class="bank-card-meta">${group.questions.filter(q=>matchesFilters(group,q)).length} of ${group.questions.length} shown · ${esc(group.sourceName)}</div>
      ${bankBadgeMarkup(group)}
      <div class="bank-issue-counts">${ISSUE_TAGS.map(t=>{
        const n=group.questions.filter(q=>issueTagsForQuestion(group,q).has(t.id)).length;
        return n?`<span class="bank-issue-chip">${esc(t.label)} ${n}</span>`:"";
      }).join("")}</div>
    </div>
  `).join("");

  dom.bankList.querySelectorAll("[data-bank-id]").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedBankId = card.dataset.bankId;
      const targetGroup = state.groups.find(group => group.id === state.selectedBankId);
      // Select the first question that satisfies the active filters.
      state.selectedQuestionId = targetGroup?.questions.find(q => matchesFilters(targetGroup, q))?.id || null;
      renderAll();
    });
  });
}

function renderQuestionList() {
  const { group, items } = filteredQuestions();
  if (!group) {
    state.selectedQuestionId = null;
    dom.questionList.innerHTML = "Analyze your Word file to review questions.";
    return;
  }
  if (!items.length) {
    state.selectedQuestionId = null;
    dom.questionList.innerHTML = `<div class="empty-state">No questions match the selected filters.</div>`;
    return;
  }

  if (!items.some(item => item.id === state.selectedQuestionId)) {
    state.selectedQuestionId = items[0]?.id || null;
  }

  dom.questionList.innerHTML = items.map(question => `
    <div class="question-card ${question.id === state.selectedQuestionId ? "selected" : ""}" data-question-id="${esc(question.id)}" tabindex="0" aria-label="Select ${esc(question.itemTitle)}" aria-current="${question.id === state.selectedQuestionId ? "true" : "false"}">
      <div class="question-card-header">
        <div>
          <div class="question-title">${esc(question.itemTitle)}</div>
          <div class="question-subtitle">${esc(questionDisplayType(question))}${question.type === "matching_question" ? ` · ${question.pairs.length} pairs` : question.type === "multiple_dropdowns_question" ? ` · ${question.blanks.length} dropdowns` : ""} · ${question.points || dom.defaultPoints.value || 1} point(s)</div>
        </div>
        <span class="badge ${question.status}">${question.status === "good" ? "Good" : question.status === "review" ? "Needs Review" : "Needs Correction"}</span>
      </div>

      <div class="question-excerpt">${esc(textFromHtml(question.stem))}</div>
      <div class="question-issue-counts">${ISSUE_TAGS.filter(t=>t.id!=="all" && issueTagsForQuestion(group,question).has(t.id)).map(t=>`<span class="bank-issue-chip">${esc(t.label)}</span>`).join("")}</div>
      ${question.issues.length ? `<div class="issue-snippet">${esc(friendlyValidationMessage(question.issues[0]))}${question.issues.length > 1 ? ` (+${question.issues.length-1} more)` : ""}</div>` : ""}

      <div class="question-actions">
        <button class="small-btn" data-open="${question.id}">Edit</button>
        <button class="small-btn" data-preview="${question.id}">Preview</button>
        <button class="small-btn" data-move="up" data-id="${question.id}" title="Move up" aria-label="Move ${esc(question.itemTitle)} up">↑</button>
        <button class="small-btn" data-move="down" data-id="${question.id}" title="Move down" aria-label="Move ${esc(question.itemTitle)} down">↓</button>
        <button class="small-btn" data-duplicate="${question.id}">Duplicate</button>
        <button class="small-btn danger-action" data-remove="${question.id}">Delete</button>
      </div>
    </div>
  `).join("");

  // Card interaction is delegated to the persistent question-list element.
  // Do not rebuild the list here: rebuilding resets its scroll position and
  // makes it feel like the first question is selected on every click.
}


// One selection handler for all questions, including questions inserted later.
// Selection updates the detail panels without resetting the question list's scroll.
function selectQuestion(questionId, tab = null) {
  const question = byId(questionId);
  if (!question) return;
  const group = state.groups.find(g => g.id === question.groupId);
  if (!group || !matchesFilters(group, question)) return;
  state.selectedBankId = group.id;
  state.selectedQuestionId = question.id;
  dom.questionList.querySelectorAll("[data-question-id]").forEach(card => {
    const selected = card.dataset.questionId === question.id;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-current", String(selected));
  });
  if (tab) switchTab(tab);
  renderEditor();
  renderPreview();
}

dom.questionList.addEventListener("click", event => {
  const move=event.target.closest("button[data-move]");
  const duplicate=event.target.closest("button[data-duplicate]");
  const remove=event.target.closest("button[data-remove]");
  if(move) {reorderQuestion(move.dataset.id,move.dataset.move);return;}
  if(duplicate) {duplicateQuestion(duplicate.dataset.duplicate);return;}
  if(remove) {removeQuestion(remove.dataset.remove);return;}
  const button = event.target.closest("button[data-open], button[data-preview]");
  if (button) {
    selectQuestion(button.dataset.open || button.dataset.preview,
      button.dataset.preview ? "preview" : "editor");
    return;
  }
  const card = event.target.closest(".question-card[data-question-id]");
  if (card) selectQuestion(card.dataset.questionId);
});
dom.questionList.addEventListener("keydown", event => {
  if (event.target.closest("button")) return;
  const card = event.target.closest(".question-card[data-question-id]");
  if (card && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    selectQuestion(card.dataset.questionId);
  }
});

function snapshotForUndo(question) {
  const {history,originalSnapshot,...data}=question;
  return JSON.parse(JSON.stringify(data));
}
function restoreImportedQuestion(question) {
  if(!question.originalSnapshot) return false;
  const clean=JSON.parse(JSON.stringify(question.originalSnapshot));
  const original=question.originalSnapshot;
  const keys=new Set(Object.keys(clean));
  for(const key of Object.keys(question)){
    if(key!=="originalSnapshot" && key!=="history" && !keys.has(key)) delete question[key];
  }
  Object.assign(question,clean);
  question.originalSnapshot=original;
  question.history=[];
  return true;
}
function rememberBeforeTypeChange(question) {
  question.history=question.history||[];
  question.history.push(snapshotForUndo(question));
  if(question.history.length>6) question.history.shift();
}
function blankQuestionData(type) {
  if(type === "true_false_question") return {
    choices:[{label:"A",html:"True",correct:false},{label:"B",html:"False",correct:false}],pairs:[],blanks:[]};
  if(type === "matching_question") return {choices:[],pairs:[{left:"",right:""},{left:"",right:""}],blanks:[]};
  if(type === "multiple_dropdowns_question") return {choices:[],pairs:[],blanks:[{id:"blank1",prompt:"Option 1",options:[]}]};
  return {choices:[{label:"A",html:"",correct:false},{label:"B",html:"",correct:false}],pairs:[],blanks:[]};
}
function recoverMatchingForConversion(question) {
  const problems=[];
  const rows=[{text:textFromHtml(question.stem||""),html:question.stem||""},...(question.sourceEvents||[])];
  const known=parseLabeledMeanings(rows,reason=>problems.push(reason));
  if(known) return {pairs:known.pairs,issues:problems};
  // Prior structured data may remain available even though the import selected MC.
  const described=(question.matchingDescriptions||[]);
  const pool=(question.matchingOptionPool||[]);
  const answerKey=(question.matchingAnswerKey||[]);
  if(described.length){
    const byLetter=new Map(pool.map(p=>[p.label,p.text]));
    const keys=new Map(answerKey.map(k=>[k.number,k.letter]));
    return {pairs:described.map((left,i)=>({left,right:byLetter.get(keys.get(i+1))||""})),issues:[]};
  }
  // Recover any known answer text rather than discarding it. Unknown right-hand
  // associations are genuinely blank, never fabricated.
  const opts=(question.choices||[]).map(c=>textFromHtml(c.html)).filter(Boolean);
  const numbered=rows.flatMap(row=>{
    const n=qtiNumberedValue(row.text||"");
    return n?[n.value]:[];
  });
  const lefts=numbered.length?numbered:opts;
  return {pairs:(lefts.length?lefts:["",""]).map(left=>({left,right:""})),issues:[]};
}
function convertQuestionType(question,nextType) {
  const old=question.type;
  if(old===nextType)return null;
  const fromChoices=["multiple_choice_question","multiple_answers_question","true_false_question"].includes(old);
  const toChoices=["multiple_choice_question","multiple_answers_question","true_false_question"].includes(nextType);
  const cleanedStem=removeAnswerKeyFromStem(question.stem||"");
  const cleanOldBlanks=old==="multiple_dropdowns_question"
    ? cleanedStem.replace(/\[[a-z][a-z0-9_]*\]/gi,"") : cleanedStem;
  const answerChoices=fromChoices ? (question.choices||[]).map(c=>({label:c.label,html:c.html,correct:!!c.correct})) :
    old==="multiple_dropdowns_question" ? [...new Set(question.blanks.flatMap(b=>(b.options||[]).map(o=>o.text)))].map(t=>({label:"",html:esc(t),correct:false})) :
    [...new Set([...(question.pairs||[]).map(p=>p.right),...(question.distractors||[])].filter(Boolean))].map(t=>({label:"",html:esc(t),correct:false}));
  if(toChoices){
    if(nextType==="true_false_question"){
      const labels=answerChoices.map(c=>textFromHtml(c.html).trim().toLowerCase());
      const compatible=answerChoices.length===2 && ["true","false"].every(s=>labels.includes(s));
      return {choices:compatible?answerChoices:[{label:"A",html:"True",correct:false},{label:"B",html:"False",correct:false}],pairs:[],blanks:[],
        stem:cleanOldBlanks,draft:!compatible || answerChoices.filter(c=>c.correct).length!==1};
    }
    const correctCount=answerChoices.filter(c=>c.correct).length;
    const compatible=nextType==="multiple_choice_question"?correctCount===1:correctCount>=2;
    return {choices:answerChoices.length>=2?answerChoices:[...answerChoices,...Array.from({length:2-answerChoices.length},()=>({label:"",html:"",correct:false}))],
      pairs:[],blanks:[],stem:cleanOldBlanks,draft:!compatible};
  }
  if(nextType==="matching_question"){
    const pairs=old==="multiple_dropdowns_question"
      ? (question.blanks||[]).map((b,i)=>({left:b.prompt||friendlyDropdownLabel(b,i),right:b.options.find(o=>o.correct)?.text||""}))
      : fromChoices ? recoverMatchingForConversion(question).pairs
      : (question.pairs||[]);
    return {choices:[],pairs:pairs.length>=2?pairs:[...pairs,...Array.from({length:2-pairs.length},()=>({left:"",right:""}))],
      blanks:[],stem:cleanOldBlanks,matchingNotes:[],distractors:[],draft:pairs.length<2||pairs.some(p=>!p.left||!p.right)};
  }
  if(nextType==="multiple_dropdowns_question"){
    if(old==="matching_question"){
      const pool=[...new Set([...(question.pairs||[]).map(p=>p.right),...(question.distractors||[])].filter(Boolean))];
      const blanks=(question.pairs||[]).map((p,i)=>({id:`blank${i+1}`,prompt:p.left||`Option ${i+1}`,
        options:pool.map(text=>({text,correct:text===p.right}))}));
      return {choices:[],pairs:[],blanks,stem:cleanOldBlanks+blanks.map(b=>`<p>${esc(b.prompt)} [${b.id}]</p>`).join(""),
        draft:blanks.length===0||blanks.some(b=>b.options.length<2||b.options.filter(o=>o.correct).length!==1)};
    }
    const choices=answerChoices.map(c=>({text:textFromHtml(c.html),correct:c.correct}));
    const blank={id:"blank1",prompt:"Option 1",options:choices};
    return {choices:[],pairs:[],blanks:[blank],stem:cleanOldBlanks+"<p>[blank1]</p>",
      draft:choices.length<2||choices.filter(o=>o.correct).length!==1};
  }
  return null;
}

function refreshReviewAfterEdit(message, kind="good") {
  state.validation=null;
  revalidateAll();renderAll();
  if(message) setStatus(esc(message),kind);
}
function renderEditor() {
  const question=selectedQuestion();
  const group=state.groups.find(g=>g.id===question?.groupId);
  if(!question||!group){dom.editorPanel.innerHTML="Select a question to edit it.";return;}
  const types=[
    ["multiple_choice_question","Multiple Choice"],
    ["multiple_answers_question","Multiple Answers"],
    ["true_false_question","True / False"],
    ["matching_question","Matching"],
    ["multiple_dropdowns_question","Multiple Dropdowns"]
  ];
  let inputMarkup="";
  if(question.type==="multiple_dropdowns_question") {
    inputMarkup=`<div class="editor-group"><h3>Dropdown blanks</h3>
      <p class="validation-help">Each blank needs a matching [blankId] in Stem HTML and exactly one correct option (mark it with *).</p>
      ${(question.blanks||[]).map((b,i)=>`<div class="dropdown-editor-row"><div class="dropdown-editor-head"><strong>${esc(friendlyDropdownLabel(b,i))}</strong><small class="validation-help">Internal ID: ${esc(b.id)}</small><button type="button" class="small-btn" data-delete-blank="${i}">Delete</button></div>
        <label class="field"><span>Blank ID</span><input data-blank-id="${i}" value="${esc(b.id)}"></label>
        <label class="field"><span>Label / prompt</span><input data-blank-prompt="${i}" value="${esc(b.prompt)}"></label>
        <label class="field"><span>Options (comma-separated; * marks correct)</span><textarea rows="2" data-blank-options="${i}">${esc(dropdownOptionsText(b.options))}</textarea></label>
      </div>`).join("")}
      <button class="small-btn" type="button" id="addBlankBtn">Add dropdown blank</button></div>`;
  } else if(["multiple_choice_question","multiple_answers_question","true_false_question"].includes(question.type)) {
    inputMarkup=`<div class="editor-group"><h3>Choices</h3><div id="choiceContainer">
      ${(question.choices||[]).map((c,i)=>`<div class="choice-row"><div class="mini-label">${String.fromCharCode(65+i)}</div>
        <input type="text" data-choice-text="${i}" value="${esc(textFromHtml(c.html))}" placeholder="Answer choice">
        <label class="toggle"><input type="checkbox" data-choice-correct="${i}" ${c.correct?"checked":""}><span>Correct</span></label>
        <button type="button" class="icon-btn" data-delete-choice="${i}">Delete</button></div>`).join("")}</div>
      ${question.type!=="true_false_question"?'<button type="button" class="small-btn" id="addChoiceBtn">Add choice</button>':""}</div>`;
  } else {
    inputMarkup=`<div class="editor-group"><h3>Matching pairs</h3><p class="validation-help">Right-hand values are displayed without A/B/C labels.</p>
      ${(question.pairs||[]).map((pair,i)=>`<div class="pair-row matching"><input data-pair-left="${i}" value="${esc(pair.left)}" placeholder="Matching prompt">
        <input data-pair-right="${i}" value="${esc(pair.right)}" placeholder="Correct answer">
        <button type="button" class="icon-btn" data-delete-pair="${i}">Delete</button></div>`).join("")}
      <button type="button" class="small-btn" id="addPairBtn">Add pair</button>
      <label class="field"><span>Unused distractors (one per line, optional)</span><textarea id="editDistractors" rows="3">${esc((question.distractors||[]).join("\n"))}</textarea></label>
    </div>`;
  }
  dom.editorPanel.innerHTML=`<div class="editor-section">
    <div class="badge-row"><span class="badge ${question.status}">${question.draft?"Draft · Needs Correction":question.status==="good"?"Good":question.status==="review"?"Needs Review":"Needs Correction"}</span><span class="badge neutral">${esc(group.unit)} – ${esc(group.lesson)} – Group ${group.number}</span></div>
    <div class="editor-group"><h3>Question details</h3>
      <label class="field"><span>Item title</span><input id="editItemTitle" value="${esc(question.itemTitle)}"></label>
      <label class="field"><span>Question type</span><select id="editType">${types.map(([type,label])=>`<option value="${type}" ${question.type===type?"selected":""}>${label}</option>`).join("")}</select></label>
      <label class="field"><span>Points</span><input id="editPoints" type="number" min="0.01" step="0.01" value="${esc(question.points===""?dom.defaultPoints.value:question.points)}"></label>
      <label class="field"><span>Stem HTML</span><textarea id="editStem" rows="6">${esc(question.stem||"")}</textarea><small class="validation-help">HTML tags and CDN images are preserved.</small></label>
    </div>
    ${inputMarkup}
    <div class="editor-group"><h3>Feedback</h3>
      <label class="field"><span>Question rationale / feedback</span><textarea id="editFeedback" rows="4">${esc(question.feedback||"")}</textarea></label>
      ${question.type==="matching_question"?`<label class="field"><span>Matching explanations (one per line)</span><textarea id="editMatchingNotes" rows="4">${esc((question.matchingNotes||[]).map(x=>textFromHtml(x)).join("\n"))}</textarea></label>`:""}
      ${group.requiresImage?`<label class="field"><span>Shared image URL</span><input id="editSharedImage" type="url" placeholder="https://cdn-media..." value="${esc(group.imageUrl||"")}"></label>`:""}
      ${group.teacherNotes?.length||question.internalNotes?.length?`<details><summary>Internal production notes (not exported)</summary>${[...(group.teacherNotes||[]),...(question.internalNotes||[])].map(t=>`<p>${esc(t)}</p>`).join("")}</details>`:""}
      <label class="field"><span>Group feedback (applied to every question)</span><textarea id="editGroupFeedback" rows="4">${esc(group.feedback||"")}</textarea></label>
    </div>
    ${hasManualReviewIssue(question) && !question.reviewConfirmed ? `<label class="manual-review-confirm">
      <input type="checkbox" id="confirmAnswersCheckbox" ${question.reviewConfirmed ? "checked" : ""}>
      <span><strong>Confirm Answers</strong><small>I have checked the question, its answer choices, and the correct answers. After Save Changes, mark it Good if validation passes.</small></span>
    </label>` : ""}
    <div class="editor-actions action-list">
      <button type="button" class="btn btn-secondary" id="saveDraftBtn">Save Draft</button>
      <button type="button" class="btn btn-primary" id="saveQuestionBtn">Save Changes</button>
      <button type="button" class="btn btn-quiet" id="restoreOriginalBtn">Restore Original</button>
      ${question.history?.length?'<button type="button" class="btn btn-quiet" id="undoTypeBtn">Undo type change</button>':""}
    </div>
    <div id="typeSwitchPrompt" class="type-switch-prompt hidden" role="group" aria-label="Change question type">
      <strong>Change question type</strong><p>Keep the original version for undo. Convert compatible data, start a blank template, or cancel.</p>
      <div class="action-list"><button type="button" id="convertTypeBtn" class="btn btn-primary">Convert existing</button>
      <button type="button" id="blankTypeBtn" class="btn btn-secondary">Start blank template</button>
      <button type="button" id="cancelTypeBtn" class="btn btn-quiet">Cancel</button></div>
    </div>
  </div>`;
  const readForm=()=>{
    const title=document.getElementById("editItemTitle").value.trim();
    question.customTitle=Boolean(title&&title!==questionTitleFromGroupTitle(group.title,question.index));
    question.itemTitle=title||questionTitleFromGroupTitle(group.title,question.index);
    question.points=document.getElementById("editPoints").value;
    question.stem=normalizeQuestionStemHtml(document.getElementById("editStem").value);
    question.feedback=safeFeedbackHtml(document.getElementById("editFeedback").value);
    group.feedback=safeFeedbackHtml(document.getElementById("editGroupFeedback").value);
    const image=document.getElementById("editSharedImage");if(image)group.imageUrl=image.value.trim();
    if(question.type==="matching_question"){
      question.pairs=[...dom.editorPanel.querySelectorAll("[data-pair-left]")].map((input,i)=>({
        left:input.value.trim(),right:dom.editorPanel.querySelector(`[data-pair-right="${i}"]`)?.value.trim()||""
      }));
      question.distractors=document.getElementById("editDistractors").value.split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
      const beforeNotes=(question.matchingNotes||[]).map(t=>textFromHtml(t)).join("\n").trim();
      const enteredNotes=document.getElementById("editMatchingNotes").value.trim();
      if(enteredNotes!==beforeNotes)question.matchingNotesAuthored=true;
      question.matchingNotes=enteredNotes.split(/\r?\n/).map(t=>t.trim()).filter(Boolean).map(t=>`<li>${esc(t)}</li>`);
    } else if(question.type==="multiple_dropdowns_question"){
      question.blanks=[...dom.editorPanel.querySelectorAll("[data-blank-id]")].map((input,i)=>({
        id:input.value.trim(),prompt:dom.editorPanel.querySelector(`[data-blank-prompt="${i}"]`)?.value.trim()||"",
        options:parseDropdownOptions(dom.editorPanel.querySelector(`[data-blank-options="${i}"]`)?.value||"")
      }));
    } else {
      question.choices=[...dom.editorPanel.querySelectorAll("[data-choice-text]")].map((input,i)=>({
        label:String.fromCharCode(65+i),
        html:question.choices[i]&&textFromHtml(question.choices[i].html)===input.value.trim() ? question.choices[i].html : esc(input.value.trim()),
        correct:!!dom.editorPanel.querySelector(`[data-choice-correct="${i}"]`)?.checked
      }));
    }
  };
  const save=(draft=false,rerender=true)=>{
    const substantive=q=>JSON.stringify([q.type,q.stem,q.choices,q.pairs,q.blanks]);
    const prior=substantive(question);
    const confirm=document.getElementById("confirmAnswersCheckbox");
    const confirmOnSave=Boolean(confirm?.checked);
    readForm();
    const changed=substantive(question)!==prior;
    question.draft=draft;
    // An existing sign-off survives a no-op save but not a material edit.
    // For edited content the user must explicitly check Confirm Answers again.
    if(changed && !confirmOnSave)question.reviewConfirmed=false;
    if(!draft){
      if(hasManualReviewIssue(question) && confirm)question.reviewConfirmed=confirmOnSave;
      reconcileManualParserIssues(question,changed);
    }
    if(rerender){
      refreshReviewAfterEdit(draft?"Draft saved. Review and select Save Changes when ready.":
        question.reviewConfirmed?"Answers confirmed. The question status and bank counts were updated.":
          "Changes saved and validated. Confirm Answers if you have checked an outstanding review warning.",
        draft?"review":question.reviewConfirmed?"good":"review");
    }
  };
  document.getElementById("saveQuestionBtn").onclick=()=>save(false);
  document.getElementById("saveDraftBtn").onclick=()=>save(true);
  document.getElementById("restoreOriginalBtn").onclick=()=>{
    if(!question.originalSnapshot){setStatus("No imported version is available for this question.","review");return;}
    if(!window.confirm("Restore this question to its original imported version? Your manual changes to this question will be discarded."))return;
    const ok=restoreImportedQuestion(question);
    if(ok)refreshReviewAfterEdit("Original imported question restored. Existing source issues remain visible.",question.parseIssues?.length?"review":"good");
  };
  const historyBtn=document.getElementById("undoTypeBtn");
  if(historyBtn) historyBtn.onclick=()=>{
    const previous=question.history.pop(),history=question.history;
    if(!previous)return;
    Object.assign(question,previous);question.history=history;
    refreshReviewAfterEdit("Previous question version restored.");
  };
  const redraw=()=>{readForm();state.validation=null;revalidateAll();renderEditor();renderPreview();};
  const addChoice=document.getElementById("addChoiceBtn");
  if(addChoice)addChoice.onclick=()=>{readForm();question.choices.push({label:"",html:"",correct:false});renderEditor();};
  dom.editorPanel.querySelectorAll("[data-delete-choice]").forEach(btn=>btn.onclick=()=>{
    readForm();question.choices.splice(Number(btn.dataset.deleteChoice),1);renderEditor();
  });
  const addPair=document.getElementById("addPairBtn");
  if(addPair)addPair.onclick=()=>{readForm();question.pairs.push({left:"",right:""});renderEditor();};
  dom.editorPanel.querySelectorAll("[data-delete-pair]").forEach(btn=>btn.onclick=()=>{
    readForm();question.pairs.splice(Number(btn.dataset.deletePair),1);renderEditor();
  });
  const addBlank=document.getElementById("addBlankBtn");
  if(addBlank)addBlank.onclick=()=>{
    readForm();const id=uniqueBlankId(question,`blank${question.blanks.length+1}`);
    question.blanks.push({id,prompt:`Option ${question.blanks.length+1}`,options:[]});question.stem+=`<p>[${id}]</p>`;renderEditor();
  };
  dom.editorPanel.querySelectorAll("[data-delete-blank]").forEach(btn=>btn.onclick=()=>{
    readForm();const removed=question.blanks.splice(Number(btn.dataset.deleteBlank),1)[0];
    if(removed)question.stem=question.stem.replace(`[${removed.id}]`,"");renderEditor();
  });
  document.getElementById("editType").onchange=event=>{
    const requested=event.target.value;const old=question.type;
    if(requested===old)return;
    const compatible=convertQuestionType(question,requested);
    const prompt=document.getElementById("typeSwitchPrompt");prompt.classList.remove("hidden");
    document.getElementById("convertTypeBtn").disabled=!compatible;
    const cancel=()=>{document.getElementById("editType").value=old;prompt.classList.add("hidden");};
    document.getElementById("cancelTypeBtn").onclick=cancel;
    const apply=blank=>{
      readForm();rememberBeforeTypeChange(question);
      const data=blank?blankQuestionData(requested):convertQuestionType(question,requested);
      if(!data){cancel();return;}
      Object.assign(question,{...data,type:requested});
      if(blank&&old==="multiple_dropdowns_question"&&requested!==old)question.stem=question.stem.replace(/\[[a-z][a-z0-9_]*\]/gi,"");
      if(blank){
        question.draft=true;
        if(requested==="multiple_dropdowns_question"&&!question.stem.includes("[blank1]")){
          question.blanks=[{id:"blank1",prompt:"Option 1",options:[]}];question.stem+="<p>[blank1]</p>";
        }
      } else question.draft=!!data.draft;
      question.parseIssues=[];
      state.validation=null;revalidateAll();renderAll();
      setStatus(blank?"Blank template created. Complete and save the draft.":
        question.draft?"Type converted, but answer mapping requires manual completion before export.":
        "Question type converted. Review and save the result.",question.draft?"review":"good");
    };
    document.getElementById("blankTypeBtn").onclick=()=>{
      if(!window.confirm("Start a blank question template? Current answer choices will be replaced; your previous version can be restored."))return;
      apply(true);
    };
    document.getElementById("convertTypeBtn").onclick=()=>apply(false);
  };
}

dom.expandEditorBtn.addEventListener("click",()=>{
  state.editorExpanded=!state.editorExpanded;
  document.querySelector("#reviewView .inspector").classList.toggle("expanded",state.editorExpanded);
  dom.expandEditorBtn.textContent=state.editorExpanded?"Close expanded view":"Expand editor";
  dom.expandEditorBtn.setAttribute("aria-pressed",String(state.editorExpanded));
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&state.editorExpanded)dom.expandEditorBtn.click();
});
function selectedBankForManage() {return state.groups.find(g=>g.id===state.selectedBankId)||state.groups[0];}
function newQuestionForBank(group,type="multiple_choice_question") {
  const blank=blankQuestionData(type);
  const created={id:`q_manual_${++state.idSequence}_${Date.now()}`,groupId:group.id,stem:"",...blank,
    distractors:[],type,feedback:"",points:"",itemTitle:"",customTitle:false,internalNotes:[],matchingNotes:[],
    parseIssues:[],issues:[],draft:true,status:"correction",history:[]};
  created.originalSnapshot=snapshotForUndo(created);
  return created;
}
function prepareQuestionSelection(group,id) {
  state.selectedBankId=group.id;state.selectedQuestionId=id;
  state.search="";state.filter="all";state.questionTypeFilter="all";
  dom.searchBox.value="";dom.questionTypeFilter.value="all";
  document.querySelectorAll(".filter-card").forEach(x=>x.classList.toggle("active",x.dataset.filter==="all"));
  state.validation=null;revalidateAll();renderAll();switchTab("editor");
}
dom.addQuestionBtn.addEventListener("click",()=>{
  const group=selectedBankForManage();if(!group)return;
  const question=newQuestionForBank(group);
  group.questions.push(question);prepareQuestionSelection(group,question.id);
});
function duplicateQuestion(id){
  const question=byId(id);if(!question)return;
  const group=state.groups.find(g=>g.id===question.groupId);const index=group.questions.indexOf(question);
  const copy=JSON.parse(JSON.stringify(question));
  copy.id=`q_copy_${++state.idSequence}_${Date.now()}`;copy.customTitle=false;copy.draft=true;
  copy.parseIssues=[];copy.history=[];
  copy.originalSnapshot=snapshotForUndo(copy);
  group.questions.splice(index+1,0,copy);prepareQuestionSelection(group,copy.id);
}
function reorderQuestion(id,direction){
  const q=byId(id);if(!q)return;
  const group=state.groups.find(g=>g.id===q.groupId),index=group.questions.indexOf(q);
  const target=index+(direction==="up"?-1:1);
  if(target<0||target>=group.questions.length)return;
  [group.questions[index],group.questions[target]]=[group.questions[target],group.questions[index]];
  state.selectedBankId=group.id;state.selectedQuestionId=id;
  state.validation=null;revalidateAll();renderAll();
}
function removeQuestion(id){
  const question=byId(id);if(!question||!window.confirm(`Delete ${question.itemTitle}? This cannot be undone.`))return;
  const group=state.groups.find(g=>g.id===question.groupId);
  group.questions=group.questions.filter(q=>q.id!==id);
  state.selectedQuestionId=group.questions[0]?.id||null;
  state.validation=null;revalidateAll();renderAll();
}

function previewQuestionStem(question) {
  let html=normalizeQuestionStemHtml(question.stem);
  if(question.type !== "multiple_dropdowns_question")return html;
  const names=new Map(question.blanks.map((b,i)=>[b.id.toLowerCase(),friendlyDropdownLabel(b,i)]));
  return html.replace(/\[([a-z][a-z0-9_]*)\]/gi,(original,id)=>{
    const label=names.get(id.toLowerCase());
    return label ? `<span class="preview-inline-dropdown">${esc(label)}</span>` : original;
  });
}
function renderPreview() {
  const question = selectedQuestion();
  const group = state.groups.find(g => g.id === question?.groupId);

  if (!question || !group) {
    dom.previewPanel.innerHTML = "Select a question to preview it here.";
    return;
  }

  const heading = dom.includeHeading.checked ? `<h4><strong>${esc(group.title)}</strong></h4>` : "";
  const feedbackHtml = generalFeedbackHtml(question, group);

  let body = "";
  if (question.type === "matching_question") {
    body = `
      <table border="1" cellpadding="8" cellspacing="0">
        <thead><tr><th>Left</th><th>Right</th></tr></thead>
        <tbody>${question.pairs.map(pair => `<tr><td>${esc(pair.left)}</td><td>${esc(pair.right)}</td></tr>`).join("")}</tbody>
      </table>
    `;
  } else if (question.type === "multiple_dropdowns_question") {
    body=`<div class="dropdown-preview-help">Dropdown answer key (instructor view)</div>` + question.blanks.map(blank=>
      `<div class="dropdown-preview-row"><strong>${esc(friendlyDropdownLabel(blank,question.blanks.indexOf(blank)))}</strong><select aria-label="${esc(friendlyDropdownLabel(blank,question.blanks.indexOf(blank)))}">${blank.options.map(o=>`<option ${o.correct ? "selected" : ""}>${esc(o.text)}</option>`).join("")}</select><span class="badge ${blank.options.filter(o=>o.correct).length===1 ? "good" : "correction"}">${esc(blank.options.find(o=>o.correct)?.text || "Not set")}</span></div>`
    ).join("");
  } else {
    body = `<ul>${question.choices.map(choice => `<li>${choice.correct ? "✓ " : ""}${choice.html}</li>`).join("")}</ul>`;
  }

  dom.previewPanel.innerHTML = `
    <div class="preview-wrap">
      <div class="badge-row">
        <span class="badge ${question.status}">${question.status === "good" ? "Good" : question.status === "review" ? "Needs Review" : "Needs Correction"}</span>
        <span class="badge neutral">${esc(questionDisplayType(question))}</span>
        ${question.type === "matching_question" ? `<span class="badge good">${question.pairs.length} matching pairs</span>` : ""}
        ${question.type === "multiple_dropdowns_question" ? `<span class="badge neutral">${question.blanks.length} dropdowns</span>` : ""}
      </div>
      <div class="preview-question">
        <h3>${esc(question.itemTitle)}</h3>
        ${heading}
        <div>${placeholderHtml(group)}${previewQuestionStem(question)}</div>
        ${body}
        ${feedbackHtml ? `<div class="preview-feedback"><strong>General feedback</strong><div>${feedbackHtml}</div></div>` : ""}
      </div>
    </div>
  `;
}

function runValidation() {
  revalidateAll();
  const questions = state.groups.flatMap(group => group.questions);
  const report = {
    generated_at: new Date().toISOString(),
    totals: {
      banks: state.groups.length,
      questions: questions.length,
      good: questions.filter(q => q.status === "good").length,
      review: questions.filter(q => q.status === "review").length,
      correction: questions.filter(q => q.status === "correction").length
    },
    settings: {
      default_points: Number(dom.defaultPoints.value || 1),
      questions_per_set: Number(dom.questionsPerSet.value || 0) || null,
      include_heading_in_stem: dom.includeHeading.checked,
      exclude_references: dom.excludeReferences.checked,
      shuffle_answers: dom.shuffleAnswers.checked,
      output_mode: dom.outputMode.value
    },
    banks: state.groups.map(group => ({
      name: `${group.unit} – ${group.lesson} – Group ${group.number}: ${group.title}`,
      source_name: group.sourceName,
      status: group.status,
      issues: group.issues.map(issue => issue.text),
      requires_image: !!group.requiresImage,
      image_placeholder_pending: !!group.requiresImage && !canonicalCdnImageUrl(group.imageUrl || ""),
      internal_notes: group.teacherNotes || [],
      questions: group.questions.map(question => ({
        item_title: question.itemTitle,
        type: question.type,
        status: question.status,
        points: Number(question.points || dom.defaultPoints.value || 1),
        matching_pairs: question.type === "matching_question" ? question.pairs.length : undefined,
        dropdown_blanks: question.type === "multiple_dropdowns_question" ? question.blanks.length : undefined,
        internal_notes: question.internalNotes || [],
        draft: !!question.draft,
        general_feedback_present: !!generalFeedbackHtml(question,group),
        issues: question.issues.map(issue => issue.text)
      }))
    }))
  };
  state.validation = report;
  renderValidationPanel();
  if (state.activeView === "review") switchTab("validation");
  const totalCorrections = report.totals.correction;
  const type = totalCorrections ? "correction" : report.totals.review ? "review" : "good";
  setStatus(`Validation complete. ${report.totals.good} good, ${report.totals.review} review, ${report.totals.correction} correction.`, type);
  renderAll();
}

function renderValidationPanel() {
  if (!state.validation) {
    dom.validationPanel.innerHTML = "Run validation to view a concise summary and any issues that need attention.";
    return;
  }
  const report = state.validation;
  const issues = report.banks.flatMap(bank => [
    ...(bank.issues || []).filter(issue => !/ needs review\.$| contains critical issues\.$/i.test(issue)).map(text => ({
      title:bank.name, status:bank.status, text
    })),
    ...bank.questions.flatMap(question => (question.issues||[]).map(text => ({
      title:question.item_title, status:question.status, text
    })))
  ]);
  dom.validationPanel.innerHTML = `
    <div class="validation-report">
      <div class="validation-block">
        <h4>Validation summary</h4>
        <div class="badge-row">
          <span class="badge good">${report.totals.good} good</span>
          <span class="badge review">${report.totals.review} need review</span>
          <span class="badge correction">${report.totals.correction} need correction</span>
          <span class="badge neutral">${report.totals.banks} banks</span>
          <span class="badge neutral">${report.totals.questions} questions</span>
        </div>
        <p class="validation-help">Feedback is optional. Only actual content or mapping issues are flagged.</p>
      </div>
      <div class="validation-block">
        <h4>${issues.length ? "Items to check" : "All checks passed"}</h4>
        ${issues.length ? `<div class="validation-issue-list">${issues.slice(0,80).map(issue=>`
          <div class="validation-issue">
            <span class="badge ${issue.status}">${issue.status==="correction"?"Fix":issue.status==="review"?"Review":"Info"}</span>
            <div><b>${esc(issue.title)}</b><p>${esc(friendlyValidationMessage(issue.text))}</p></div>
          </div>`).join("")}</div>${issues.length>80?`<p class="validation-help">${issues.length-80} more issues are included in the downloadable report.</p>`:""}`
        : `<p class="validation-clear">No structural or answer-mapping issues detected. The QTI package is ready for export.</p>`}
      </div>
    </div>`;
}

function buildAssessmentXml(group) {
  const bankId = `${group.unit}_${group.lesson}_group_${group.number}`.replace(/\W+/g, "_").toLowerCase();
  const bankTitle = `${group.unit} – ${group.lesson} – Group ${group.number}: ${group.title}`;

  const itemsXml = group.questions.map((question, index) => {
    const actualStem=textFromHtml(question.stem || "");
    if (/(?:^|\n)\s*Correct\s+(?:Answers?|Matches?)\s*:/i.test(actualStem) ||
        /Correct\s+(?:Answers?|Matches?)\s*:\s*(?:[A-H]\s*(?:→|->|[-–—:])\s*\d+|\d+\s*(?:→|->|[-–—:])\s*[A-H])/i.test(actualStem))
      throw new Error(`Answer key was found in the student stem of ${question.itemTitle}. Correct the source before export.`);
    const itemId = `${bankId}_q${index + 1}`;
    const points = Number(question.points || dom.defaultPoints.value || 1);
    const stemHtml = finalStemHtml(question, group);
    const feedbackHtml = generalFeedbackHtml(question, group);
    const feedbackBlock = feedbackHtml
      ? `<itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html"><![CDATA[${feedbackHtml}]]></mattext></material></flow_mat></itemfeedback>`
      : "";

    if (question.type === "multiple_dropdowns_question") {
      const responses=question.blanks.map((blank,blankIndex)=>`
        <response_lid ident="response_${blank.id}" rcardinality="Single">
          <material><mattext texttype="text/plain">${esc(friendlyDropdownLabel(blank,blankIndex))}</mattext></material>
          <render_choice shuffle="${dom.shuffleAnswers.checked ? "Yes" : "No"}">
            ${blank.options.map((opt,i)=>`
              <response_label ident="${blank.id}_${i+1}"><material><mattext texttype="text/plain">${esc(opt.text)}</mattext></material></response_label>
            `).join("")}
          </render_choice>
        </response_lid>
      `).join("");
      const score=question.blanks.length ? 100/question.blanks.length : 0;
      const processing=question.blanks.map(blank=>{
        const index=blank.options.findIndex(opt=>opt.correct);
        return `<respcondition continue="Yes"><conditionvar><varequal respident="response_${blank.id}">${blank.id}_${index+1}</varequal></conditionvar><setvar varname="SCORE" action="Add">${score.toPrecision(13).replace(/0+$/,"").replace(/\.$/,"")}</setvar></respcondition>`;
      }).join("");
      return `<item ident="${itemId}" title="${esc(question.itemTitle)}">
        <itemmetadata><qtimetadata>
          <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_dropdowns_question</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${points}</fieldentry></qtimetadatafield>
        </qtimetadata></itemmetadata>
        <presentation><material><mattext texttype="text/html"><![CDATA[${stemHtml}]]></mattext></material>${responses}</presentation>
        <resprocessing><outcomes><decvar varname="SCORE" vartype="Decimal" minvalue="0" maxvalue="100"/></outcomes>
          ${feedbackHtml ? `<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>` : ""}
          ${processing}
        </resprocessing>${feedbackBlock}</item>`;
    }

    if (question.type === "matching_question") {
      const matchingChoices=[...new Set([
        ...question.pairs.map(pair=>pair.right),...(question.distractors||[])
      ])];
      const responses = question.pairs.map((pair, pairIndex) => `
        <response_lid ident="response_${pairIndex + 1}" rcardinality="Single">
          <material><mattext texttype="text/plain">${esc(pair.left)}</mattext></material>
          <render_choice shuffle="${dom.shuffleAnswers.checked ? "Yes" : "No"}">
            ${matchingChoices.map((answer, choiceIndex) => `
              <response_label ident="match_${choiceIndex + 1}">
                <material><mattext texttype="text/plain">${esc(answer)}</mattext></material>
              </response_label>
            `).join("")}
          </render_choice>
        </response_lid>
      `).join("");

      const scoreEach = question.pairs.length ? 100 / question.pairs.length : 0;
      const conditions = question.pairs.map((pair, pairIndex) => `
        <respcondition continue="Yes">
          <conditionvar>
            <varequal respident="response_${pairIndex + 1}">match_${matchingChoices.indexOf(pair.right) + 1}</varequal>
          </conditionvar>
          <setvar varname="SCORE" action="Add">${scoreEach}</setvar>
        </respcondition>
      `).join("");

      return `
        <item ident="${itemId}" title="${esc(question.itemTitle)}">
          <itemmetadata><qtimetadata>
            <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>matching_question</fieldentry></qtimetadatafield>
            <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${points}</fieldentry></qtimetadatafield>
          </qtimetadata></itemmetadata>
          <presentation>
            <material><mattext texttype="text/html"><![CDATA[${stemHtml}]]></mattext></material>
            ${responses}
          </presentation>
          <resprocessing>
            <outcomes><decvar varname="SCORE" vartype="Decimal" minvalue="0" maxvalue="100"/></outcomes>
            ${feedbackHtml ? `<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>` : ""}
            ${conditions}
          </resprocessing>
          ${feedbackBlock}
        </item>
      `;
    }

    let qType = question.type;
    let rCardinality = qType === "multiple_answers_question" ? "Multiple" : "Single";
    let labels = question.choices.map((choice, idx) => ({ ...choice, label: String.fromCharCode(65 + idx) }));

    const choicesXml = labels.map(choice => `
      <response_label ident="${choice.label}">
        <material><mattext texttype="text/html"><![CDATA[${choice.html}]]></mattext></material>
      </response_label>
    `).join("");

    let conditionVar = "";
    if (qType === "multiple_answers_question") {
      conditionVar = `
        <and>
          ${labels.map(choice =>
            choice.correct
              ? `<varequal respident="response1">${choice.label}</varequal>`
              : `<not><varequal respident="response1">${choice.label}</varequal></not>`
          ).join("")}
        </and>
      `;
    } else {
      const correct = labels.find(choice => choice.correct);
      conditionVar = `<varequal respident="response1">${correct ? correct.label : ""}</varequal>`;
    }

    return `
      <item ident="${itemId}" title="${esc(question.itemTitle)}">
        <itemmetadata><qtimetadata>
          <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>${qType}</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>${points}</fieldentry></qtimetadatafield>
        </qtimetadata></itemmetadata>
        <presentation>
          <material><mattext texttype="text/html"><![CDATA[${stemHtml}]]></mattext></material>
          <response_lid ident="response1" rcardinality="${rCardinality}">
            <render_choice shuffle="${dom.shuffleAnswers.checked ? "Yes" : "No"}">
              ${choicesXml}
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes><decvar varname="SCORE" vartype="Decimal" minvalue="0" maxvalue="${points}"/></outcomes>
          ${feedbackHtml ? `<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>` : ""}
          <respcondition continue="No">
            <conditionvar>${conditionVar}</conditionvar>
            <setvar varname="SCORE" action="Set">${points}</setvar>
          </respcondition>
        </resprocessing>
        ${feedbackBlock}
      </item>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <objectbank ident="${bankId}" title="${esc(bankTitle)}">
    <qtimetadata>
      <qtimetadatafield>
        <fieldlabel>bank_title</fieldlabel>
        <fieldentry>${esc(bankTitle)}</fieldentry>
      </qtimetadatafield>
    </qtimetadata>
    ${itemsXml}
  </objectbank>
</questestinterop>`;
}

function manifest(resources) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="qti_manifest" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <organizations/>
  <resources>
    ${resources.map(resource => `
      <resource identifier="${resource.id}" type="imsqti_xmlv1p2" href="${resource.file}">
        <file href="${resource.file}"/>
      </resource>
    `).join("")}
  </resources>
</manifest>`;
}

async function exportQti() {
  revalidateAll();
  const allQuestions = state.groups.flatMap(group => group.questions);
  if (!allQuestions.length || state.groups.some(group => group.status === "correction") || allQuestions.some(q=>q.draft)) {
    setStatus("Export is blocked because some questions still need correction.", "correction");
    switchTab("validation");
    runValidation();
    return;
  }

  if (!state.validation) runValidation();
  const outputMode = dom.outputMode.value;
  const rootName = (state.files[0]?.name || "canvas_qti_export").replace(/\.docx$/i, "").replace(/[^A-Za-z0-9_-]+/g, "_");

  try {
    if (outputMode === "combined") {
      const zip = await buildCombinedZip();
      saveBlob(await zip.generateAsync({ type: "blob" }), `${rootName}_combined_qti.zip`);
    } else if (outputMode === "individual") {
      const zip = await buildIndividualBundle();
      saveBlob(await zip.generateAsync({ type: "blob" }), `${rootName}_individual_qti_bundle.zip`);
    } else {
      throw new Error(`Unsupported package format: ${outputMode}`);
    }
    setStatus("QTI export completed.", "good");
  } catch (error) {
    console.error(error);
    setStatus("The QTI package could not be generated.", "correction");
  }
}

function assertValidQtiXml(xml,group){
  const documentXml=new DOMParser().parseFromString(xml,"application/xml");
  if(documentXml.querySelector("parsererror")) throw new Error(`Invalid QTI XML for ${group.title}.`);
  const root=documentXml.documentElement;
  if(root.localName!=="questestinterop") throw new Error("QTI root must be questestinterop.");
  const items=[...documentXml.getElementsByTagNameNS("*","item")];
  if(items.length!==group.questions.length) throw new Error(`QTI question count mismatch in ${group.title}.`);
  for(let index=0;index<items.length;index++){
    const item=items[index],question=group.questions[index];
    const fields=[...item.getElementsByTagNameNS("*","qtimetadatafield")];
    const points=fields.find(field=>field.getElementsByTagNameNS("*","fieldlabel")[0]?.textContent==="points_possible");
    if(!points) throw new Error(`Missing points_possible metadata on ${question.itemTitle}.`);
    const feedback=[...item.getElementsByTagNameNS("*","itemfeedback")];
    if(generalFeedbackHtml(question,group) && feedback.length!==1) throw new Error(`Missing General Feedback on ${question.itemTitle}.`);
    if(!generalFeedbackHtml(question,group) && feedback.length) throw new Error(`Unexpected feedback on ${question.itemTitle}.`);
  }
}
function assertManifestXml(xml,resources){
  const doc=new DOMParser().parseFromString(xml,"application/xml");
  if(doc.querySelector("parsererror") || doc.documentElement.localName!=="manifest")throw new Error("Invalid imsmanifest.xml.");
  const declared=[...doc.getElementsByTagNameNS("*","resource")];
  if(declared.length!==resources.length)throw new Error("Manifest resource count does not match the number of QTI banks.");
  for(const resource of resources){
    const item=declared.find(node=>node.getAttribute("href")===resource.file);
    if(!item || item.getAttribute("type")!=="imsqti_xmlv1p2" || resource.file.includes("/"))
      throw new Error(`Invalid manifest resource path or QTI type for ${resource.file}.`);
  }
}

async function buildCombinedZip() {
  const zip = new JSZip();
  const resources = [];
  state.groups.forEach((group, index) => {
    const file = `bank_${String(index + 1).padStart(2, "0")}.xml`;
    const id = `resource_${String(index + 1).padStart(2, "0")}`;
    resources.push({ id, file });
    const qtiXml=buildAssessmentXml(group);
    assertValidQtiXml(qtiXml,group);
    zip.file(file,qtiXml);
  });
  const manifestXml=manifest(resources);
  assertManifestXml(manifestXml,resources);
  zip.file("imsmanifest.xml",manifestXml);
  if (state.validation) zip.file("validation.json", JSON.stringify(state.validation, null, 2));
  return zip;
}

async function buildIndividualBundle() {
  const bundle = new JSZip();
  for (let i = 0; i < state.groups.length; i += 1) {
    const group = state.groups[i];
    const inner = new JSZip();
    const qtiXml=buildAssessmentXml(group);
    assertValidQtiXml(qtiXml,group);
    inner.file("assessment.xml",qtiXml);
    const resources=[{id:`resource_${i+1}`,file:"assessment.xml"}];
    const manifestXml=manifest(resources);
    assertManifestXml(manifestXml,resources);
    inner.file("imsmanifest.xml",manifestXml);
    if (state.validation) inner.file("validation.json", JSON.stringify(state.validation, null, 2));
    const safeName = `${group.unit}_${group.lesson}_group_${group.number}_${group.title}`.replace(/[^A-Za-z0-9_-]+/g, "_");
    bundle.file(`${String(i + 1).padStart(2, "0")}_${safeName}.zip`, await inner.generateAsync({ type: "blob" }));
  }
  return bundle;
}

function saveBlob(blob, fileName) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

renderAll();

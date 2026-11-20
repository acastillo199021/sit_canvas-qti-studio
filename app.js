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
  unitFilter: "all",
  lessonFilter: "all",
  sourceCommentsByFile: {},
  issueFilter: "all",
  feedbackFilter: "all",
  importWarnings: [],
  sourcePointRules: {},
  defaultPointsUserEdited: false,
  editorExpanded: false,
  selectedForMove: new Set(),
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
  unitFilter: document.getElementById("unitFilter"),
  lessonFilter: document.getElementById("lessonFilter"),
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
  nextQuestionBtn: document.getElementById("nextQuestionBtn"),
  previousQuestionBtn: document.getElementById("previousQuestionBtn"),
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
function unresolvedQuestionImageReference(question,group){
  // Sentences that explicitly refer to a picture/diagram are actionable
  // even when the author forgot to embed an image in Word.
  const text=textFromHtml(question.stem||"");
  const refersToVisual=/\b(?:picture\s+below|image\s+(?:above|below)|in\s+the\s+image|in\s+this\s+image|glands\s+in\s+the\s+image|in\s+the\s+diagram|in\s+the\s+figure)\b/i.test(text);
  return refersToVisual && !hasQuestionImage(question) &&
    !canonicalCdnImageUrl(group?.imageUrl||"");
}
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
dom.unitFilter.addEventListener("change",()=>{
  state.unitFilter=dom.unitFilter.value;state.lessonFilter="all";renderAll();
});
dom.lessonFilter.addEventListener("change",()=>{state.lessonFilter=dom.lessonFilter.value;renderAll();});
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

dom.defaultPoints.addEventListener("input",()=>{state.defaultPointsUserEdited=true;});
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
    state.sourcePointRules = {};
    state.sourceCommentsByFile = {};
    let allGroups = [];
    const observedSourcePoints = [];
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
      try{state.sourceCommentsByFile[file.name]=await readDocxComments(arrayBuffer);}
      catch(error){console.warn("Word comments could not be read",error);state.sourceCommentsByFile[file.name]=[];}
      const sourceRule = detectSourcePointsRule(result.value);
      if (sourceRule != null) {
        state.sourcePointRules[file.name] = sourceRule;
        observedSourcePoints.push(sourceRule);
      }
      const fileGroups = parseHtmlToGroups(result.value, file.name);
      fileGroups.forEach(g=>g.sourcePointsPerQuestion=sourceRule);
      attachInternalDocxNotes(fileGroups,state.sourceCommentsByFile[file.name]||[]);
      allGroups = allGroups.concat(fileGroups);
    }
    state.groups = allGroups;
    // A uniform source-level rule overrides the initial UI default, but remains
    // fully editable. A mismatch introduced later is flagged during validation.
    if (observedSourcePoints.length && observedSourcePoints.length===state.files.length &&
        observedSourcePoints.every(n=>n===observedSourcePoints[0]) &&
        Number(dom.defaultPoints.value)===1 && !state.defaultPointsUserEdited && !state.groups.some(g=>g.questions.some(q=>q.points!==""&&q.points!=null))) {
      dom.defaultPoints.value=String(observedSourcePoints[0]);
    }
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
// NOTES-057: Word margin comments are internal review material, never QTI.
async function readDocxComments(arrayBuffer) {
  if (typeof JSZip === "undefined") return [];
  const zip=await JSZip.loadAsync(arrayBuffer);
  const content=zip.file("word/comments.xml");
  if(!content)return [];
  const xml=new DOMParser().parseFromString(await content.async("string"),"application/xml");
  const docXml=zip.file("word/document.xml");
  const source=docXml?new DOMParser().parseFromString(await docXml.async("string"),"application/xml"):null;
  const nsAttr=(el,name)=>el.getAttribute("w:"+name)||el.getAttribute(name)||"";
  const contentText=el=>[...el.getElementsByTagName("w:t")].map(x=>x.textContent||"").join("").trim();
  const contexts=new Map();
  let current={unit:"",lesson:"",number:0};
  if(source){
    const headings=/^(U\s*\d+)\s*[–—−-]\s*(L\s*\d+)\s*[–—−-]\s*Group\s*#?\s*(\d+)(?:\s*[:–—−-]\s*|\s+)(.+)$/i;
    for(const para of [...source.getElementsByTagName("w:p")]){
      const text=contentText(para);const match=text.match(headings);
      if(match)current={unit:match[1].replace(/\s+/g,"").toUpperCase(),lesson:match[2].replace(/\s+/g,"").toUpperCase(),number:Number(match[3])};
      for(const mark of [...para.getElementsByTagName("w:commentRangeStart"),...para.getElementsByTagName("w:commentReference")]){
        const id=nsAttr(mark,"id");if(id)contexts.set(id,{...current,context:text.slice(0,180)});
      }
    }
  }
  return [...xml.getElementsByTagName("w:comment")].map(comment=>{
    const id=nsAttr(comment,"id"),text=contentText(comment);
    return {id,author:nsAttr(comment,"author"),text,...(contexts.get(id)||{})};
  }).filter(note=>note.text && !/^(?:Need Mei to confirm where the minus|start here\s*$)/i.test(note.text));
}
function attachInternalDocxNotes(groups,notes){
  for(const note of notes){
    const group=groups.find(g=>g.unit===note.unit&&g.lesson===note.lesson&&g.number===note.number);
    if(!group)continue;
    const text=`${note.author?note.author+": ":""}${note.text}`;
    const target=group.questions.find(q=>note.context&&q.stem&&
      textFromHtml(q.stem).toLowerCase().includes(note.context.slice(0,40).toLowerCase()));
    if(target)target.internalNotes.push(text);
    else (group.teacherNotes ||= []).push(text+(note.context?` [Source context: ${note.context}]`:""));
  }
}
function isDiagnosticGroup(group){return group?.unit==="SOURCE" && group?.lesson==="CHECK";}
function normalizeChemicalEquationHtml(html){
  const value=String(html||"");
  // Replace a standalone mojibake arrow ONLY in recognizable chemical equations.
  if(!/\sà\s/.test(value) || !/[+]/.test(textFromHtml(value)))return value;
  return value.replace(/\sà\s/g," → ");
}
function qtiSourceEvents(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const events=[];
  const push=(html,kind="text",meta={})=>{
    // Preserve underscores here: they encode numbered dropdown blanks in Word.
    // They are cleaned only after the question type has been identified.
    html=String(html).replace(/\[\s*MD\d+\s*\]/gi,"");
    const text=String(textFromHtml(html)).replace(/\s+/g," ").trim();
    if(/^\s*(?:Need Mei to confirm where the minus|start here\s*$)/i.test(text))return;
    if(text) events.push({html,text,kind,...meta});
  };
  for(const el of [...doc.body.children]){
    const tag=el.tagName.toLowerCase();
    if(tag==="table") {events.push({html:el.outerHTML,text:normalizeSpaces(el.textContent),kind:"table",element:el});continue;}
    // Some Word converters wrap several answer paragraphs in a blockquote.
    // Treat each inner paragraph as its own choice, preserving rich formatting.
    if(tag==="blockquote" && el.querySelectorAll("p").length>1){
      for(const child of el.querySelectorAll("p"))push(blockInnerHtml(child));
      continue;
    }
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
          push(frag,letter?"letter-list":numbering?"numbered-list":"bullet",{listIndex:i,automaticNumbering:numbering,automaticLettering:letter});
        });
      }
      continue;
    }
    let h=blockInnerHtml(el);
    for(const segment of h.split(/<br\s*\/?\s*>/i)) push(segment.trim());
  }
  return events;
}
// PARSER-080/081/082: A Word automatic list may encode the FIRST answer
// options as decimal <ol><li> even though the remaining options are written
// explicitly as *B., C., D. (or *C., D.). This is not a new numbered
// question. Recover only a bounded, independently corroborated option run;
// leave medical Matching / dropdown numbering untouched.
function qtiRecoverAutoLetteredOptions(events){
  const result=events.map(event=>({...event}));
  const choiceRx=/^\s*\*?\s*([A-H])\s*[.)]\s*\*?\s*\S/i;
  const startsQuestion=text=>{
    const clean=String(text||"").replace(/^\s*\d+\s*[.)]\s*/,"").trim();
    return qtiQuestionStemCandidate(clean) ||
      (clean.length>=16 && /\?\s*$/.test(clean) && /^(?:the|an?|in|during|after|before)\b/i.test(clean));
  };
  for(let i=0;i<result.length;i++){
    const first=result[i];
    if(first.kind!=="numbered-list" || !first.automaticNumbering || startsQuestion(first.text))continue;
    // Only recover runs at the start of an answer set, after a real question.
    const previous=result.slice(Math.max(0,i-8),i);
    const lastBoundary=previous.findLastIndex(e=>/^(?:U\s*\d+\s*[-–—]\s*L\s*\d+\s*[-–—]\s*Group\b|Options\s*:|Medical\s+Terms\s*:|Meanings\s*:|Correct\s+(?:Answers?|Matches?)\s*:|IST\s*:)/i.test(e.text||""));
    const context=lastBoundary>=0?previous.slice(lastBoundary+1):previous;
    if(!context.some(e=>startsQuestion(e.text)) || context.some(e=>e.kind==="table"))continue;
    // A run must be immediately followed by its next explicit answer label.
    let end=i;
    while(end<result.length && end-i<8 && result[end].kind==="numbered-list" &&
       result[end].automaticNumbering && !startsQuestion(result[end].text))end++;
    const run=result.slice(i,end);
    const following=result[end];
    const nextLetter=String(following?.text||"").match(choiceRx)?.[1]?.toUpperCase();
    const expectedNext=String.fromCharCode(65+run.length);
    if(!run.length || !nextLetter || nextLetter!==expectedNext)continue;
    if(run.some((e,k)=>{
      const plain=String(e.text||"").replace(/^\s*\d+\s*[.)]\s*/,"").trim();
      const marker=plain.match(choiceRx)?.[1]?.toUpperCase();
      return marker && marker!==String.fromCharCode(65+k);
    }))continue;
    for(let k=0;k<run.length;k++){
      const e=result[i+k];
      let cleanHtml=e.html;
      // Auto-generated number never appears in the original <li> innerHTML;
      // a manually typed "B." within the same item must be stripped once.
      cleanHtml=stripLeadingTextPrefix(cleanHtml,/^\s*\d+\s*[.)]\s*/);
      cleanHtml=stripLeadingTextPrefix(cleanHtml,/^\s*\*?\s*[A-H]\s*[.)]\s*\*?\s*/i);
      const marked=/^\s*\*/.test(String(e.text||"").replace(/^\s*\d+\s*[.)]\s*/,""));
      const label=String.fromCharCode(65+k);
      e.html=`${marked?"*":""}${label}. ${cleanHtml}`;
      e.text=textFromHtml(e.html).trim();
      e.kind="letter-list";
      e.automaticNumbering=false;
      e.automaticLettering=true;
      e.sourceAutoChoiceRecovered=true;
      e.sourceAutoNumber=run[k].listIndex;
    }
    i=end-1;
  }
  return result;
}

// Source-level answer evidence survives editor re-numbering and Save Changes.
// It validates structural option retention without forcing exact wording
// to remain unchanged when an instructor deliberately edits an answer.
function qtiSourceChoiceEvidence(question){
  if(!["multiple_choice_question","multiple_answers_question","true_false_question"].includes(question.type))return null;
  const choices=(question.sourceEvents||[]).flatMap(e=>{
    const m=String(e.text||"").match(/^\s*(\*?)\s*([A-H])\s*[.)]\s*(\*?)\s*(.+)$/is);
    return m?[{label:m[2].toUpperCase(),correct:!!(m[1]||m[3]),text:m[4].trim(),recovered:!!e.sourceAutoChoiceRecovered}]:[];
  });
  if(choices.length<2)return null;
  return {count:choices.length,choices,recovered:choices.filter(c=>c.recovered).length,
    distinctLabels:[...new Set(choices.map(c=>c.label))].length};
}

function stripLeadingTextPrefix(html,prefixRx){
  const doc=new DOMParser().parseFromString(`<div id="qti-strip-prefix">${html}</div>`,"text/html");
  const root=doc.getElementById("qti-strip-prefix");
  const match=(root.textContent||"").match(prefixRx);
  if(!match)return String(html||"");
  let remaining=match[0].length;
  const walker=doc.createTreeWalker(root,4),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){if(!remaining)break;
    const amount=Math.min(remaining,(node.nodeValue||"").length);
    node.nodeValue=node.nodeValue.slice(amount);remaining-=amount;
  }
  return root.innerHTML.trim();
}
function qtiCleanLine(value){return normalizeSpaces(textFromHtml(value));}
function qtiQuestionStemCandidate(text){
  const original=String(text||"").trim();
  // PARSER-070: A/B/C/D options may contain question marks and "client".
  // They are never question starts, even across Word page boundaries.
  if(/^\*?\s*[a-h]\s*[.)]\s*\*?\s*\S/i.test(original))return false;
  const value=original.replace(/^\s*\d+\s*[.),]\s*/,"").trim();
  return /^(?:match\b|select\b|place\b|using\b|which\b|what\b|how\b|identify\b|choose\b|complete\b|the client\b|a client\b|two clients\b|several clients\b|each of these\b|in the following\b)/i.test(value)
    || (/\?/.test(value) && /(?:client|medical|symptoms|substance|term|condition|structure|signs)/i.test(value));
}
function qtiNumberedValue(text) {
  const m=String(text||"").match(/^\s*(\d+)\s*[.),]\s*(.+)$/s);
  return m ? {index:Number(m[1]),value:m[2].trim()} : null;
}
function qtiStripQuestionNumber(html) {
  return String(html||"").replace(/^\s*\d+\s*[.),]\s*/,"").trim();
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
// v3.13: Matching grids are ordered sets of *prompts* and a shuffled
// teacher option pool. A Word table's horizontal row is NOT automatically a
// correct match (e.g. 1. Aden/o | A. Pancreas has the key 1-E).
function qtiParseShuffledMatchingTables(records, matchingTables, issue) {
  const rows=matchingTables.flat();
  const numbered=rows.map(row=>({row,item:qtiNumberedValue(row.left)})).filter(x=>x.item);
  if(!numbered.length)return null; // Keep the tested legacy table parsers.
  const keyAt=records.findIndex(e=>isAnswerKeyEvent(e.text));
  const keyRecords=keyAt<0?[]:records.slice(keyAt);
  const keys=qtiParseKey(keyRecords.map(e=>e.text).join(" "));
  const byLetter=new Map();
  for(const row of rows){
    const label=extractLetter(row.right);
    if(!label)continue;
    const text=stripOptionLabel(row.right);
    if(byLetter.has(label) && byLetter.get(label)!==text)issue(`Conflicting option ${label} in Matching table.`);
    byLetter.set(label,text);
  }
  const pairs=[];let sourceKey="";
  if(keys.length && byLetter.size){
    sourceKey="lettered";
    const keyByNum=new Map();
    for(const key of keys){
      if(keyByNum.has(key.number))issue(`Duplicate Matching key for row ${key.number}.`);
      keyByNum.set(key.number,key.letter);
    }
    for(const {item} of numbered){
      const answer=keyByNum.get(item.index);
      if(!answer || !byLetter.has(answer))issue(`Matching row ${item.index} cannot be resolved from the answer key.`);
      pairs.push({left:item.value,right:byLetter.get(answer)||""});
    }
    for(const key of keyByNum.keys())if(!numbered.some(x=>x.item.index===key))issue(`Answer key ${key} references missing Matching row.`);
    if(keys.length!==numbered.length)issue("Matching key count does not match source table rows.");
  } else if(keyAt>=0){
    // The right column may contain only underscore placeholders. In this
    // format the ordered Correct Answers list supplies the right values.
    const entries=[];
    for(const event of keyRecords){
      const raw=event.text.replace(/^\s*Correct\s+(?:Answers?|Matches?)\s*:\s*/i,"");
      const found=qtiNumberedValue(raw);
      if(found)entries.push(found);
      else for(const m of raw.matchAll(/(?:^|\s)(\d+)\s*[.)]\s+(.+?)(?=\s+\d+\s*[.)]\s+|$)/g))
        if(m[2].trim())entries.push({index:Number(m[1]),value:m[2].trim()});
    }
    if(entries.length){
      sourceKey="ordered";
      const byNumber=new Map(entries.map(e=>[e.index,e.value]));
      for(const {item} of numbered){
        if(!byNumber.has(item.index))issue(`Missing ordered answer for Matching row ${item.index}.`);
        pairs.push({left:item.value,right:byNumber.get(item.index)||""});
      }
      if(entries.length!==numbered.length)issue("Ordered answers do not match Matching row count.");
    }
  }
  if(!sourceKey){
    // Preserve the existing direct-pair support, but DO NOT misinterpret
    // shuffled lettered choices as aligned pairs in the absence of a key.
    if(byLetter.size){
      for(const {item} of numbered)pairs.push({left:item.value,right:""});
      issue("The Matching table contains lettered choices but no verifiable answer key.");
    }else{
      for(const {row,item} of numbered)pairs.push({left:item.value,right:row.right});
      if(pairs.some(p=>!p.right))issue("The Matching table contains blank answers without a resolvable key.");
      else issue("Confirm direct Matching table associations; no explicit key was found.","review");
    }
  }
  if(!pairs.length)issue("Matching table has no numbered source descriptions.");
  return {pairs,distractors:[...byLetter].filter(([letter])=>!keys.some(k=>k.letter===letter)).map(([,value])=>value),sourceKey};
}

// v3.13 PARSER-046/047: A Word term-building item can have 2, 4 or 6
// independently graded blanks, shared answer pools, and a teacher-only key.
// This conversion is deliberately separate from legacy numbered / bracketed
// dropdowns and does NOT change old Matching/MC detection.
function qtiNumberedPoolTokens(value){
  const src=String(value||"").replace(/\u00a0/g," ")
    .replace(/\s+\+\s+(?=\d+\s*[.)])/g," ");
  const rx=/(?:^|\s)(\d{1,2})\s*[.)]\s*/g;
  const positions=[...src.matchAll(rx)];
  return positions.map((m,i)=>({number:Number(m[1]),text:src.slice(m.index+m[0].length,i+1<positions.length?positions[i+1].index:src.length).trim().replace(/\s*\+\s*$/,'')}))
    .filter(x=>x.text && !/^_{3,}$/.test(x.text));
}
function qtiWordPartKey(text){
  const list=[];
  const s=String(text||"").replace(/\u00a0/g," ");
  const rx=/([A-F])\s*[.)]\s*(?:-\s*)?(?:(\d{1,2})\s*(?:[.)]\s*|(?=\S)))?([\s\S]*?)(?=\s*\+\s*[A-F]\s*[.)]|\s+[A-F]\s*[.)]\s*(?:-?\d+\s*[.)])|$)/gi;
  for(const m of s.matchAll(rx)){
    const value=m[3].trim().replace(/^[+\s]+|[+\s]+$/g,"");
    if(value)list.push({label:m[1].toUpperCase(),number:m[2]?Number(m[2]):null,text:value});
  }
  return list;
}
function qtiSourceBlankLabels(str){
  return [...String(str||"").matchAll(/\b([A-F])\s*[.)]\s*_{2,}/gi)].map(m=>m[1].toUpperCase());
}
function qtiNormalizeMedicalValue(s){
  return normalizeSpaces(String(s||"").replace(/^[-–]\s*(?=\d)/,""))
    .replace(/^\d+\s*[.)]\s*/,"")
    .replace(/\([^)]*\)/g,"").replace(/^[\s-]+|[\s-]+$/g,"")
    .replace(/\s+/g,"").toLowerCase();
}
function qtiParseWordPartDropdowns(q,records,addIssue){
  const all=[q.stem,...records.map(e=>e.text)].join("\n");
  const hasPools=/\bOptions\s+(?:for|of)\s+[A-F]\s*[,/]\s*[A-F]\b/i.test(all);
  const hasInlinePool=/\bOptions\s*:\s*1\s*[.)]/i.test(all);
  const labels=qtiSourceBlankLabels(all);
  if((!hasPools&&!hasInlinePool)||labels.length<2)return false;
  const combinedRecords=/\bOptions\s*:/i.test(q.stem) && !records.some(e=>/\bOptions\s*:/i.test(e.text))
    ? [{text:textFromHtml(q.stem),html:q.stem,kind:"text"},...records] : records;
  const firstPool=combinedRecords.findIndex(e=>/\bOptions\s*(?:for|of)\s+[A-F]\s*[,/]\s*[A-F]|\bOptions\s*:\s*1\s*[.)]/i.test(e.text));
  if(firstPool<0)return false;
  const keyIndex=combinedRecords.findIndex(e=>/^\s*Correct\s+Answers?\s*:/i.test(e.text));
  const body=combinedRecords.slice(0,firstPool);
  const keys=combinedRecords.slice(keyIndex>=0?keyIndex:combinedRecords.length);
  const keyParts=[];
  for(const entry of keys){
    const raw=entry.text.replace(/^\s*Correct\s+Answers?\s*:\s*/i,"");
    if(!raw)continue;
    keyParts.push(...qtiWordPartKey(raw));
  }
  const pools=[];
  let active=null;
  function ensurePool(header){
    const rx=/\bOptions\s*(?:for|of)\s+([A-F](?:\s*[,/]\s*[A-F]){0,5})\s*:?(.*)$/i;
    const m=header.match(rx);
    if(m){active={labels:m[1].toUpperCase().split(/\s*[,/]\s*/),options:[]};pools.push(active);return m[2].trim();}
    if(/\bOptions\s*:\s*1\s*[.)]/i.test(header)){
      active={labels:[],options:[]};pools.push(active);
      return header.replace(/^.*?\bOptions\s*:\s*/i,"").trim();
    }
    return null;
  }
  for(const entry of combinedRecords.slice(firstPool,keyIndex>=0?keyIndex:undefined)){
    const t=entry.text;
    let rest=ensurePool(t);
    if(rest===null)rest=t;
    if(!active)continue;
    const found=qtiNumberedPoolTokens(rest);
    for(const option of found){
      const older=active.options.find(o=>o.number===option.number);
      if(older && older.text!==option.text)addIssue(`Conflicting word-part option ${option.number}.`);
      else if(!older)active.options.push(option);
    }
  }
  if(hasInlinePool && pools.length===1 && !pools[0].labels.length){
    // Word often prints 1..7 combining forms + 8..12 suffixes on a single
    // paragraph. Preserve the numbering as the authoritative partition.
    const allOptions=pools[0].options;
    const split=allOptions.findIndex(o=>/^[-–]/.test(o.text) && o.number>=8);
    const cut=split>=0?split:allOptions.findIndex(o=>o.number>=8);
    if(cut<1)addIssue("Could not distinguish combining forms and suffix choices.");
    pools.splice(0,1,
      {labels:["A","C","E"],options:cut>0?allOptions.slice(0,cut):allOptions},
      {labels:["B","D","F"],options:cut>0?allOptions.slice(cut):[]});
  }
  const uniqueLabels=[...new Set(labels)];
  q.type="multiple_dropdowns_question";q.dropdownMode="lettered-word-parts";
  // Some Word items (e.g., Sense Term Building Q3) begin directly with
  // a description rather than a `Select...` direction. The numbered opening
  // is already in q.stem, so convert its blanks as well as later body lines.
  const opening=String(q.stem||"").replace(/\b([A-F])\s*[.)]\s*_{2,}/gi,
    (_,letter)=>`${letter}. [blank${letter.toUpperCase().charCodeAt(0)-64}]`);
  q.stem=/<p\b/i.test(opening)?opening:`<p>${opening}</p>`;
  // Retain the original rich text and sentence breaks; do not show the
  // instructor option lists or Correct Answers in the student-facing stem.
  for(const e of body){
    const visible=String(e.html||esc(e.text)).replace(/\b([A-F])\s*[.)]\s*_{2,}/gi,(_,letter)=>`${letter}. [blank${letter.charCodeAt(0)-64}]`);
    q.stem+=`<p>${visible}</p>`;
  }
  q.blanks=[];
  for(const letter of uniqueLabels){
    const pool=pools.find(x=>x.labels.includes(letter)) || pools.find(x=>!x.labels.length) || null;
    const key=keyParts.find(k=>k.label===letter);
    if(!pool){addIssue(`Missing option pool for blank ${letter}.`);continue;}
    if(!key)addIssue(`Missing correct answer for blank ${letter}.`);
    const matchedByNumber=key?.number!=null?pool.options.find(o=>o.number===key.number):null;
    const matchedByText=!matchedByNumber && key?pool.options.filter(o=>qtiNormalizeMedicalValue(o.text)===qtiNormalizeMedicalValue(key.text)):[];
    const selected=matchedByNumber || (matchedByText.length===1?matchedByText[0]:null);
    if(key && !selected)addIssue(`Correct answer for blank ${letter} (${key.text}) is not one of the available options.`);
    if(key && matchedByNumber && qtiNormalizeMedicalValue(matchedByNumber.text)!==qtiNormalizeMedicalValue(key.text))
      addIssue(`Answer ${letter} references option ${key.number}, but its spelling differs from the key. Confirm the word part.`,"review");
    q.blanks.push(qtiBlankModel(`blank${letter.charCodeAt(0)-64}`,`Option ${letter.charCodeAt(0)-64}`,
      pool.options.map(o=>({text:o.text,correct:!!selected&&o.number===selected.number}))));
    if(pool.options.length<2)addIssue(`Blank ${letter} has fewer than two answer choices.`);
  }
  if(q.blanks.length!==uniqueLabels.length)addIssue("Some lettered dropdowns were not extracted.");
  if(keyParts.length!==uniqueLabels.length)addIssue("Correct Answers do not cover all dropdowns.");
  return true;
}
function qtiParseOrderedAnswerDropdowns(q,records,addIssue){
  if(records.some(e=>e.kind==="table"))return false;
  const answerAt=records.findIndex(e=>/^\s*Correct\s+Answers?\s*:/i.test(e.text));
  if(answerAt<0)return false;
  const pre=records.slice(0,answerAt);
  const numbered=pre.map(e=>({e,row:qtiNumberedValue(e.text)})).filter(x=>x.row&&/_{3,}/.test(x.row.value));
  if(numbered.length<2)return false;
  const after=records.slice(answerAt+1);
  const answers=after.map(e=>qtiNumberedValue(e.text)).filter(Boolean);
  if(!answers.length)return false;
  q.type="multiple_dropdowns_question";q.dropdownMode="ordered-answers";
  q.stem=`<p>${q.stem}</p>`;
  const answerByNumber=new Map(answers.map(a=>[a.index,a.value]));
  const pool=[...new Set(answers.map(a=>a.value))];
  q.blanks=[];
  for(const {e,row} of numbered){
    const id=`blank${row.index}`;
    q.stem+=`<p>${e.html.replace(/_{3,}/g,`[${id}]`)}</p>`;
    const answer=answerByNumber.get(row.index);
    if(!answer)addIssue(`Missing correct answer for dropdown ${row.index}.`);
    q.blanks.push(qtiBlankModel(id,`Option ${row.index}`,pool.map(v=>({text:v,correct:v===answer}))));
  }
  if(numbered.length!==answers.length)addIssue("Ordered answers do not match the number of blanks.");
  return true;
}

function directTermDefinitionPair(event){
  const text=String(event.text||"").trim();
  const m=text.match(/^(.{2,70}?)\s*[-–—]\s*(.{9,})$/s);
  if(!m || /^(?:Correct|Options|Question|Feedback|Match|Set feedback)\b/i.test(m[1]))return null;
  const term=m[1].trim(),definition=m[2].trim();
  if(!/^[A-Za-z][A-Za-z\s]{1,45}$/.test(term))return null;
  // 'Dilutio' + unbold 'n' becomes the complete 'Dilution'.
  return {left:term,right:definition};
}
function directTermDefinitionCount(events){return (events||[]).filter(e=>directTermDefinitionPair(e)).length;}
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

  // PARSER-063: three independent 'Match the following terms with their definitions'
  // questions containing bold term–definition lines, without a table or key.
  if(/^\s*Match\s+the\s+following\s+terms\s+with\s+their\s+definitions/i.test(textFromHtml(q.stem))){
    const pairs=records.map(directTermDefinitionPair).filter(Boolean);
    if(pairs.length>=2){
      q.type="matching_question";q.pairs=pairs;q.distractors=[];
      q.stem=`<p>${esc(textFromHtml(q.stem))}</p>`;
      if(pairs.length!==3)addIssue(`Source term-definition block contains ${pairs.length} pairs; please verify the intended number.`,"review");
      return;
    }
  }
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

  // Endocrine hormones / word-parts require real select controls, never MC.
  if(qtiParseWordPartDropdowns(q,records,addIssue))return;
  if(qtiParseOrderedAnswerDropdowns(q,records,addIssue))return;

  // 2. Word tables with numbered descriptions, including shuffled answer
  // columns or blank answer cells resolved by a teacher's ordered key.
  if(tableEvents.length){
    const structured=qtiParseShuffledMatchingTables(records,matchingTables,(message,level)=>addIssue(message,level));
    if(structured){
      q.type="matching_question";q.pairs=structured.pairs;
      q.distractors=structured.distractors;
      q.matchingNotes=[];
      q.matchingKeySource=structured.sourceKey;
      return;
    }
  }

  // Legacy direct-pair and arrow-key Matching remains unchanged.
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
      q.blanks.push(qtiBlankModel(id,`Option ${q.blanks.length+1}`,choices.map(o=>({text:o.text,correct:o.label===target}))));
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
    // Each Word answer paragraph is ONE choice. An answer such as "E. coli"
    // must not be parsed as another choice in that same paragraph.
    const firstChoice=row.text.match(/^\s*(\*?)\s*([A-H])\s*[.)]\s*(\*?)\s*(.+)$/is);
    const startsWithChoice=!!firstChoice;
    const choices=firstChoice ? [{label:firstChoice[2].toUpperCase(),
      correct:!!(firstChoice[1]||firstChoice[3]),text:firstChoice[4]}] : [];
    if(startsWithChoice&&choices.length){
      for(const choice of choices){
        const optionHtml=qtiHtmlWithoutChoicePrefix(row.html);
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
  // When Word marks one otherwise unmarked choice with both bold and italic,
  // treat it as an unconfirmed candidate, never as a verified answer key.
  // This preserves scientific name formatting while requiring user review.
  const marked=q.choices.filter(c=>c.correct);
  if(!marked.length){
    const decorated=q.choices.filter(c=>/<(?:strong|b)\b/i.test(c.html) && /<(?:em|i)\b/i.test(c.html));
    if(decorated.length===1){
      decorated[0].correct=true;
      q.parseIssues.push({level:"review",code:"format_based_answer",
        text:"The highlighted answer may be correct. Please verify the answer choice."});
    }
  }
  if(q.choices.filter(c=>c.correct).length>1)q.type="multiple_answers_question";
  // A source with only one choice stays incomplete rather than invented.
}
function qtiIndependentMcQuestionCount(records){
  // Independently detect numbered stems each followed by their own lettered
  // answer block. Stop at a new numbered line or a named answer-pool heading;
  // this protects nested Matching descriptions and IST ordering lists.
  let count=0;
  const candidates=[];
  for(let i=0;i<records.length;i++){
    const entry=records[i],num=qtiNumberedValue(entry.text);
    if(!num || num.value.length<8 || /^(?:Options|Medical Terms|Meanings|Correct Answers)/i.test(num.value))continue;
    let choiceCount=0,starred=0,blocked=false;
    for(let j=i+1;j<records.length;j++){
      const r=records[j],t=r.text;
      if(qtiNumberedValue(t) || r.kind==="table" || /^(?:Options|Medical\s+Terms?|Meanings?|IST|Correct\s+(?:Answer|Match))/i.test(t)){blocked=true;break;}
      if(/^\s*\*?\s*[A-H][.)]\s*/i.test(t)){
        choiceCount++;
        if(/^\s*\*/.test(t))starred++;
      }
      if(choiceCount>=4)break;
    }
    if(choiceCount>=2 && starred>=1)candidates.push(num.index);
  }
  return candidates.length;
}
// ---------------------------------------------------------------------------
// v3.17 additions. Every function below is a NEW recognition or validation
// path; none of them replaces an existing parser branch.
// ---------------------------------------------------------------------------
const QTI_EXPLICIT_OPENING=/^(?:select|match|place|which|what|how|identify|choose|complete|using|a client|the client|two clients|several clients|each of these|in the following)\b/i;
// PARSER-072: "*d. ...included? 3. What action supports...?" in ONE paragraph.
// Split only when (1) the line is a lettered answer option, (2) the embedded
// number follows sentence punctuation and equals the next expected question
// number, and (3) the remainder is shaped like a question. Options such as
// "d. 10 -itis", "b. Give 2. 5 mg" or "c. See step 7. What next?" never match.
function qtiSplitFusedQuestionEvent(event,expectedNumber){
  if(!event || event.kind==="table")return null;
  if(!/^\s*\*?\s*[A-H]\s*[.)]\s*\*?\s*\S/i.test(event.text||""))return null;
  if(!/[.?!…]\s*\d{1,2}\s*[.)]\s+\S/.test(event.text||""))return null;
  const doc=new DOMParser().parseFromString(`<div id="qti-fused">${event.html}</div>`,"text/html");
  const root=doc.getElementById("qti-fused");
  const raw=root.textContent||"";
  const rx=/([.?!…])(\s*)(\d{1,2})\s*[.)]\s+(?=\S)/g;
  let match,at=-1;
  while((match=rx.exec(raw))){
    if(Number(match[3])!==expectedNumber)continue;
    const start=match.index+match[1].length+match[2].length;
    const value=raw.slice(start).replace(/^\d{1,2}\s*[.)]\s+/,"").trim();
    if(QTI_EXPLICIT_OPENING.test(value) || (/\?\s*$/.test(value) && value.length>=12)){at=start;break;}
  }
  if(at<0)return null;
  const walker=doc.createTreeWalker(root,4);
  let node,remaining=at,target=null;
  while((node=walker.nextNode())){
    const length=(node.nodeValue||"").length;
    if(remaining<=length){target=node;break;}
    remaining-=length;
  }
  if(!target)return null;
  const range=doc.createRange();
  range.setStart(target,remaining);range.setEnd(root,root.childNodes.length);
  const tail=doc.createElement("div");
  tail.appendChild(range.extractContents());
  const tidy=el=>{
    for(const child of [...el.querySelectorAll("*")].reverse())
      if(!child.textContent.trim() && !/^(?:IMG|BR)$/.test(child.tagName) && !child.querySelector("img"))child.remove();
    return el.innerHTML.trim();
  };
  const headHtml=tidy(root),tailHtml=tidy(tail);
  const plain=html=>String(textFromHtml(html)).replace(/\s+/g," ").trim();
  if(!plain(headHtml) || !plain(tailHtml))return null;
  return [{...event,html:headHtml,text:plain(headHtml)},
    {html:tailHtml,text:plain(tailHtml),kind:"text",fusedFromPreviousLine:true}];
}
// VALID-071: count lettered answer blocks. A block starts at each label "A"
// and needs at least two options; other paragraphs (multi-paragraph options,
// stems, feedback) do not open or close a block.
function qtiAnswerBlockCount(records){
  let blocks=0,size=0;
  const close=()=>{if(size>=2)blocks++;size=0;};
  for(const record of records||[]){
    if(record.kind==="table")continue;
    const label=String(record.text||"").match(/^\s*\*?\s*([A-H])\s*[.)]\s*\*?\s*\S/i);
    if(!label)continue;
    if(label[1].toUpperCase()==="A"){close();size=1;}
    else if(size>0)size++;
  }
  close();
  return blocks;
}
// An expected count is stated ONLY for banks made entirely of Multiple Choice /
// Multiple Answers questions with their own lettered options. For Matching,
// Multiple Dropdowns, tables and shared answer pools the source structure does
// not give a reliable independent count, so none is invented.
function qtiExpectedQuestionCount(group){
  const records=group.sourceEvents||[];
  const choiceOnly=group.questions.length>0 && group.questions.every(q=>
    q.type==="multiple_choice_question"||q.type==="multiple_answers_question");
  const pooled=records.some(r=>r.kind==="table" ||
    /^(?:Options|Medical\s+Terms?|Meanings?|Combining\s+forms?|Suffixes?)\s*:/i.test(r.text||"") ||
    /^IST\s*:\s*Correct\s+order/i.test(r.text||"") || /\[[^\]\n]*,[^\]\n]*\]/.test(r.text||""));
  const blocks=group.sourceAnswerBlockCount||0;
  if(!choiceOnly || pooled || !blocks)
    return {count:null,basis:"Not determinable from the source structure (Matching, Multiple Dropdowns, tables, shared answer pools or no lettered options)."};
  return {count:Math.max(blocks,group.independentMcQuestionCount||0),
    basis:"Lettered answer blocks and numbered questions counted in the Word source."};
}
// Questions that came from this bank's source (wherever they were moved), and
// questions added by hand inside the bank.
function qtiLiveQuestionCounts(group){
  const all=state.groups.includes(group)?state.groups.flatMap(g=>g.questions):group.questions;
  return {fromSource:all.filter(q=>q.originBankId===group.id).length,
    deletedFromSource:group.manuallyDeletedSourceCount||0,
    addedHere:group.questions.filter(q=>!q.originBankId).length};
}
// VALID-074 (completes VALID-070-H): checks that the answer structure belongs
// to ONE question. These are flags for a person to resolve, never auto-fixes.
function qtiAnswerContinuityIssues(q){
  if(q.type!=="multiple_choice_question" && q.type!=="multiple_answers_question")return;
  const labels=(q.choices||[]).map(c=>String(c.label||"").toUpperCase()).filter(Boolean);
  if(new Set(labels).size!==labels.length)
    q.parseIssues.push({level:"correction",code:"merged_answer_blocks",
      text:"Answer option labels repeat inside this question (for example A-D followed by A-D). Two source questions may have been merged. Separate them or remove the extra options before export."});
  const embedded=/[.?!…]\s+\d{1,2}\s*[.)]\s+(?:which|what|how|select|identify|choose|match|complete|place|using|a client|the client)\b/i;
  const stemLike=text=>text.length>=20 && /[?:]\s*$/.test(text);
  const suspicious=(q.choices||[]).some(choice=>{
    const parts=String(choice.html||"").split(/<br\s*\/?\s*>/i).map(part=>textFromHtml(part)).filter(Boolean);
    return embedded.test(parts.join(" ")) || parts.slice(1).some(stemLike);
  });
  if(suspicious)
    q.parseIssues.push({level:"review",code:"option_contains_question",
      text:"An answer option contains text that looks like a question stem. Check whether another question was absorbed into this option."});
  if(/(?:^|\s)\*?a\s*[.)]\s+\S.*\s\*?b\s*[.)]\s+\S.*\s\*?c\s*[.)]\s+\S/i.test(textFromHtml(q.stem||"")))
    q.parseIssues.push({level:"review",code:"stem_contains_answer_labels",
      text:"The question stem contains answer labels (a., b., c.). The answer choices may not have been separated from the stem."});
}
// UI-076: dropdown options stored in the pre-v3.16 formats (one comma-separated
// string with * marking the correct answer, or a list of such strings) are
// converted to option rows without losing text, order or the correct answer.
function normalizeLegacyDropdownOptions(question){
  for(const blank of question.blanks||[]){
    if(typeof blank.options==="string")blank.options=parseDropdownOptions(blank.options);
    else if(blank.options==null && typeof blank.optionsText==="string")blank.options=parseDropdownOptions(blank.optionsText);
    else if(Array.isArray(blank.options) && blank.options.some(option=>typeof option==="string"))
      blank.options=blank.options.flatMap(option=>typeof option==="string"
        ? (option.includes(",") ? parseDropdownOptions(option) :
          [{text:option.replace(/^\s*\*+\s*/,"").trim(),correct:/^\s*\*/.test(option)}]) : [option]);
    if(!Array.isArray(blank.options))blank.options=[];
  }
}
// VALID-075: a review-level bank note the user has explicitly signed off.
function bankIssueReviewed(group,issue){
  return (group.reviewedBankIssues||[]).includes(issue?.text||"");
}
function detectSourcePointsRule(html){
  const text=textFromHtml(String(html||"").replace(/<\/p>/gi,"</p>\n"));
  const match=text.match(/\bAll\s+questions\s+(?:are|worth|have)\s+(?:worth\s+)?(\d+(?:\.\d+)?)\s+points?\s+each\b/i) ||
    text.match(/\bEach\s+question\s+(?:is\s+worth|has)\s+(\d+(?:\.\d+)?)\s+points?\b/i);
  const points=match?Number(match[1]):null;
  return points!=null&&Number.isFinite(points)&&points>0?points:null;
}
function parseHtmlToGroups(html,sourceName){
  const runId=++parseRunSequence;
  const events=qtiRecoverAutoLetteredOptions(qtiSourceEvents(html));
  // PARSER-062: allow missing colon/dash after the Group number (Group 2 What is Oxidized).
  const groupRx=/^(U\s*\d+)\s*[–—−-]\s*(L\s*\d+)\s*[–—−-]\s*Group\s*#?\s*(\d+)(?:\s*[:–—−-]\s*|\s+)(.+)$/i;
  const groups=[];
  let bank=null,current=null,questionSerial=0,feedbackMode=false,skipReferences=false;
  let pendingCaseIntro=[];
  const unmatchedHeadings=[];
  let pendingHeading="";
  const finishQuestion=()=>{
    if(!bank||!current)return;
    qtiCompileQuestion(current,current.sourceEvents,bank);
    current.stem=normalizeQuestionStemHtml(normalizeChemicalEquationHtml(removeAnswerKeyFromStem(current.stem)));
    // VALID-074: answer continuity checks on the freshly parsed structure.
    qtiAnswerContinuityIssues(current);
    current.sourceChoiceEvidence=qtiSourceChoiceEvidence(current);
    current.originalSnapshot=snapshotForUndo(current);
    bank.questions.push(current);current=null;
  };
  // PARSER-072: events are consumed from a queue so that one Word paragraph
  // holding "last option + next numbered question" can be split in place.
  const queue=[...events];
  for(let cursor=0;cursor<queue.length;cursor++){
    let event=queue[cursor];
    if(bank&&current){
      const fused=qtiSplitFusedQuestionEvent(event,questionSerial+1);
      if(fused){queue.splice(cursor,1,fused[0],fused[1]);event=fused[0];}
    }
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
      groups.push(bank);feedbackMode=false;skipReferences=false;questionSerial=0;pendingCaseIntro=[];continue;
    }
    if(!bank)continue;
    (bank.sourceEvents ||= []).push(event);
    const text=event.text;
    if(dom.excludeReferences.checked&&/^References?\s*:?$/i.test(text)){skipReferences=true;continue;}
    if(skipReferences)continue;
    // PARSER-065: Word sometimes prefixes a Set feedback paragraph with '7 -'.
    const feedbackText=text.replace(/^\s*\d+\s*[-–—.)]\s*(?=(?:(?:Set|General)\s+)?Feedback\b)/i,"");
    // Only a bank-level heading before its first question is group feedback.
    // A Feedback: paragraph inside a question remains question-specific.
    // PARSER-073: an explicit "Set feedback" / "General feedback" block is
    // bank-level by definition, even when the author wrote it AFTER the
    // questions. (v3.16 appended that text to the last answer choice.) A plain
    // "Feedback:" inside a question is still question-specific, as before.
    const trailingGroupFeedback=!!current && current.sourceEvents.length>0 &&
      /^(?:set|general)\s+feedback\b/i.test(feedbackText);
    if(trailingGroupFeedback && String(bank.feedback||"").trim() &&
        !bank.parseIssues.some(i=>i.code==="multiple_group_feedback"))
      bank.parseIssues.push({level:"review",code:"multiple_group_feedback",
        text:"Set feedback appears more than once in this bank. Both parts were kept in Group Feedback; confirm the text."});
    if((!current||trailingGroupFeedback) && /^(?:(?:set|general)\s+)?feedback\s*[:–—-]?\s*$/i.test(feedbackText)){
      bank.feedbackExpected=true;feedbackMode=true;continue;
    }
    const feedbackInline=(!current||trailingGroupFeedback) ? feedbackText.match(/^(?:(?:set|general)\s+)?feedback\s*[:–—-]\s*(.+)$/i) : null;
    if(feedbackInline){
      bank.feedbackExpected=true;
      // Strip the source marker, but keep its bold/italic Word text runs.
      const formatted=stripLeadingTextPrefix(event.html,/^\s*(?:\d+\s*[-–—.)]\s*)?(?:(?:Set|General)\s+)?Feedback\s*[:–—-]\s*/i);
      bank.feedback=[bank.feedback,formatted||esc(feedbackInline[1])].filter(Boolean).join("<br>");
      feedbackMode=true;continue;
    }
    const isIST=/^(?:IST|BV\s+ticket)\s*:/i.test(text);
    const productionImage=/^(?:Add\s+feedback\s+image|Question\s+stem\s+image|image\s+pending|Pilus|Capsule|Cell\s+wall|Nucleoid)\s*[:=]/i.test(text) ||
      /^https?:\/\/adtalempdcd\.go\.easyprojects\.net\//i.test(text);
    if(isIST||productionImage){
      bank.teacherNotes.push(text);
      if(/(?:shared|all questions|each question|this set|this pool|question stem image|same image)/i.test(text) && /image/i.test(text))bank.requiresImage=true;
      if(/^(?:Question\s+stem\s+image)\s*:/i.test(text))bank.requiresImage=true;
      if(/drop[- ]?downs?|drop down/i.test(text))bank.forceDropdown=true;
      if(current&&isIST)current.sourceEvents.push(event); // Ordering IST is retained for internal parsing.
      // A feedback-image ticket is a *production dependency*, not feedback text.
      if(/^Add\s+feedback\s+image/i.test(text))bank.feedbackImagePending=true;
      continue;
    }
    // Standalone 1./2./3. introduces a clinical case whose patient record
    // follows in subsequent paragraphs; no question mark is required.
    const bareNumber=text.match(/^\s*(\d+)\s*[.),]\s*$/);
    const numbered=qtiNumberedValue(text) || (bareNumber?{index:Number(bareNumber[1]),value:""}:null);
    const candidate=qtiQuestionStemCandidate(text);
    // Numbered outer stems can begin with ANY subject ("The...", "In terms...",
    // "During..."), contain literal blanks, and end in a period or ellipsis.
    // Determine boundaries from preceding completed answer sets, NOT vocabulary.
    const numberedSentence=!!numbered && numbered.value.length>=8 &&
      !/^(?:Options|Medical\s+Terms|Meanings|Correct\s+(?:Answers?|Matches?))\b/i.test(numbered.value);
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
    const precedingDirectPairs=directTermDefinitionCount(priorEvents);
    const nextDirectMatching=!!numbered && /^Match\s+the\s+following\s+terms\s+with\s+their\s+definitions/i.test(numbered.value);
    const directMatchingComplete=precedingDirectPairs>=2 && nextDirectMatching &&
      /^Match\s+the\s+following\s+terms\s+with\s+their\s+definitions/i.test(textFromHtml(current?.stem||""));
    const previousQuestionCompleted=priorHasKey||priorHasChoices||priorHasDropdownOptions||priorHasOrderedTerms||directMatchingComplete;
    // Internal numbered descriptions and ordering terms have no completed
    // choice block before them, so they stay inside the current question.
    const meaningsAt=priorEvents.findIndex(e=>/^Meanings?\s*:/i.test(e.text));
    const insideMeaningList=meaningsAt>=0 && !priorHasKey;
    // Numbered teacher answer lists are NOT question openers. In particular,
    // "2. Adren/o, Adrenal/o" or "3. Antidiuretic hormone" belong to a
    // Correct Answers list, even if they are longer than eight characters.
    const keyAt=priorEvents.findIndex(e=>isAnswerKeyEvent(e.text));
    const entriesAfterKey=keyAt>=0?priorEvents.slice(keyAt+1):[];
    const inOrderedKey=keyAt>=0 && entriesAfterKey.some(e=>
      /^\s*\d+\s*[.)]\s+/.test(e.text) || e.kind==="numbered-list");
    const keyListValue=!!numbered && (inOrderedKey ||
      (priorHasKey && /\/o\b|^.{0,35}$/.test(numbered.value))) &&
      !/^(?:match|select|place|which|what|how|identify|choose|complete|using|the client|a client)\b/i.test(numbered.value);
    const bareQuestion=!!bareNumber && (!current || previousQuestionCompleted);
    const structuralNumberedStem=!!numbered && numberedSentence && !keyListValue &&
      (!current || previousQuestionCompleted) &&
      // A numbered term inside IST ordering or Matching meanings is NEVER
      // a new question; only the next explicit outer stem can close the item.
      !(orderNoteAt>=0 && priorHasOrderedTerms && !explicitNumberedStem) &&
      !(insideMeaningList && !explicitNumberedStem);
    const isNewQuestion=event.kind!=="table" && (candidate||structuralNumberedStem||bareQuestion) && (
      !current || (previousQuestionCompleted && (numbered ? (structuralNumberedStem||bareQuestion||explicitNumberedStem) : candidate)));
    if(event.kind!=="table" && isNewQuestion && numbered)bank.sourceNumberedQuestionCount++;
    // If the source repeats a plausible outer number before the preceding
    // answer pool exists, retain the content rather than dropping it. Mark
    // the ambiguous split for human review.
    if(current && numbered && explicitNumberedStem && numbered.index===questionSerial+1 && !previousQuestionCompleted){
      if(!current.parseIssues.some(i=>i.code==="question_boundary_ambiguous"))
        current.parseIssues.push({level:"review",code:"question_boundary_ambiguous",
          text:"We couldn't confirm where this question starts or ends. Please review the question."});
    }
    const numberedOpening=!!numbered && (candidate||structuralNumberedStem);
    const standaloneUnnumbered=/\?/.test(text) && /^(?:Which|What|How|Select|Identify|Match|Choose|A client|The client)\b/i.test(text);
    const realOpeningInFeedback=event.kind!=="table" &&
      (structuralNumberedStem || bareQuestion || explicitNumberedStem || (bank.feedback && standaloneUnnumbered));
    if(feedbackMode){
      if(/^Scenario\s*:?$/i.test(text)){
        pendingCaseIntro.push(event.html);continue;
      }
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
      current=qtiNewQuestion(bank,++questionSerial,
        [...pendingCaseIntro,stem].filter(Boolean).join("<br>"));
      pendingCaseIntro=[];
      current.originBankId=bank.id; // VALID-071: count source questions even after a move.
      current.sourceSequenceNumber=numbered?.index??null;
      if(event.fusedFromPreviousLine)current.internalNotes.push(
        `Parser note: question ${numbered?numbered.index:questionSerial} was joined to the previous answer line in the Word source and was separated automatically.`);
      if(!numbered && questionSerial>1)current.parseIssues.push({level:"review",code:"question_boundary",text:"Unnumbered question boundary identified from the question text. Confirm the split."});
      continue;
    }
    if(current){current.sourceEvents.push(event);continue;}
    // Do not invent questions from headings, feedback or instructions.
    if(text.length>3)bank.parseIssues.push({level:"review",text:`Content before first question was not classified: ${text.slice(0,120)}`});
  }
  finishQuestion();
  // PARSER-083: An omitted source number is not ambiguous when the surrounding
  // numbered questions prove its position AND it has a complete independent
  // answer block. Leave other unnumbered questions for manual review.
  for(const g of groups){
    for(let i=1;i<g.questions.length-1;i++){
      const question=g.questions[i],prior=g.questions[i-1],next=g.questions[i+1];
      if(question.sourceSequenceNumber!=null ||
         prior.sourceSequenceNumber!==i || next.sourceSequenceNumber!==i+2)continue;
      if(![prior,question,next].every(q=>q.sourceChoiceEvidence?.count>=2 &&
          q.choices?.length===q.sourceChoiceEvidence.count &&
          q.choices.some(c=>c.correct) &&
          new Set(q.choices.map(c=>c.label)).size===q.choices.length))continue;
      question.parseIssues=question.parseIssues.filter(x=>x.code!=="question_boundary");
      question.sourceSequenceInferred=i+1;
      question.internalNotes.push(`Parser note: source question number ${i+1} was omitted; the independent answer block and neighboring numbered questions establish its position.`);
    }
  }
  // Independently count numbered MC openings with their OWN lettered choices.
  // A missed first question must not be hidden by subsequent Good questions.
  for(const g of groups){
    const independent=qtiIndependentMcQuestionCount(g.sourceEvents||[]);
    g.independentMcQuestionCount=independent;
    if(independent>=2 && g.questions.length<independent)
      g.parseIssues.push({level:"correction",code:"missing_source_questions",
        text:`Some questions may be missing: the document contains at least ${independent} numbered questions with answer options, but only ${g.questions.length} were imported.`});
  }
  for(const g of groups){
    if(g.sourceNumberedQuestionCount>=2 && g.questions.length<g.sourceNumberedQuestionCount)
      g.parseIssues.push({level:"correction",code:"possible_question_merge",
        text:`Possible question merge: ${g.sourceNumberedQuestionCount} numbered question openings were found, but only ${g.questions.length} question(s) were created.`});
  }
  // VALID-071: an expected question count that does NOT depend on the
  // boundary decisions above, so over-splits and merges can both be detected.
  for(const g of groups){
    g.sourceAnswerBlockCount=qtiAnswerBlockCount(g.sourceEvents||[]);
    const expectation=qtiExpectedQuestionCount(g);
    g.expectedQuestionCount=expectation.count;g.expectedQuestionBasis=expectation.basis;
  }
  // PARSER-073: a plain "Feedback:" after the LAST question only may be meant
  // for the whole bank. Never guess: keep it on the question and ask.
  for(const g of groups){
    if(g.questions.length<2 || textFromHtml(g.feedback||""))continue;
    const hasFeedbackLine=q=>(q.sourceEvents||[]).some(e=>/^\s*Feedback\s*[:–—-]/i.test(e.text));
    if(hasFeedbackLine(g.questions[g.questions.length-1]) && !g.questions.slice(0,-1).some(hasFeedbackLine))
      g.trailingFeedbackCandidate=true;
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
      siblings[0].parseIssues.push({level:"review",code:"group_numbering_gap",text:`Group numbering gap: Group ${n} was not detected in ${siblings[0].unit} ${siblings[0].lesson}. Check the source.`});
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
  for(const group of groups){
    group.feedback=removeEmptyRichTextTags(group.feedback);
    for(const [i,q] of group.questions.entries()){
      q.index=i+1;q.itemTitle=questionTitleFromGroupTitle(group.title,i+1);
      q.feedback=removeEmptyRichTextTags(q.feedback);
    }
  }
  return groups;
}

function removeEmptyRichTextTags(source){
  // Small, deterministic HTML cleanup: do not remove tags containing images.
  let html=String(source||"");
  for(let i=0;i<5;i++){
    const cleaned=html.replace(/<(strong|b|em|i|u)\b[^>]*>\s*(?:&nbsp;|\u00a0|<br\s*\/?>|\s)*<\/\1>/gi,"");
    if(cleaned===html)break;
    html=cleaned;
  }
  return html;
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
  return removeEmptyRichTextTags(root.innerHTML);
}

function generalFeedbackHtml(question, group) {
  // Inferred matching keys are instructor-only. Include Matching explanations
  // ONLY when manually edited/confirmed as explicitly authored feedback.
  const notes=question.matchingNotesAuthored && question.matchingNotes?.length
    ? `<ul>${question.matchingNotes.join("")}</ul>` : "";
  const feedbackImage=canonicalCdnImageUrl(group.feedbackImageUrl || "");
  const imageMarkup=feedbackImage?`<p><img style="display: block; margin-left: auto; margin-right: auto;" role="presentation" src="${esc(feedbackImage)}" alt="Feedback illustration" width="640" height="360" /></p>`:"";
  return [question.feedback,notes,group.feedback,imageMarkup]
    .filter(Boolean).map(html=>removeAnswerKeyFromStem(html)).filter(Boolean).join("<br><br>");
}

// VALID-075: numbering gaps are recalculated from the current groups, so the
// warning clears once groups are created, moved or renumbered.
function recomputeNumberingGaps(){
  const sets=new Map();
  for(const group of state.groups){
    group.liveNumberingGaps=[];
    if(isDiagnosticGroup(group))continue;
    const key=`${group.sourceName}|${group.unit}|${group.lesson}`;
    if(!sets.has(key))sets.set(key,[]);
    sets.get(key).push(group);
  }
  for(const siblings of sets.values()){
    const nums=[...new Set(siblings.map(g=>g.number))].sort((a,b)=>a-b);
    for(let n=nums[0]+1;n<nums[nums.length-1];n++)if(!nums.includes(n))
      siblings[0].liveNumberingGaps.push({level:"review",code:"group_numbering_gap",
        text:`Group numbering gap: Group ${n} was not detected in ${siblings[0].unit} ${siblings[0].lesson}. Check the source.`});
  }
}
function revalidateAll() {
  recomputeNumberingGaps();
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
  normalizeLegacyDropdownOptions(question); // UI-076
  if (!question.customTitle) question.itemTitle = questionTitleFromGroupTitle(group.title, index + 1);
  // VALID-034: Manual sign-off resolves ONLY parser uncertainty. It must not
  // remove substantive errors (missing correct answers, malformed Matching,
  // empty blanks, pending image dependencies, etc.).
  question.issues = (question.parseIssues || []).filter(issue=>
    !(question.reviewConfirmed && isManualReviewIssue(issue)));
  if (question.draft) question.issues.push({level:"review",text:"Draft saved. Review the question and select Save Changes when finished."});
  // Missing shared media is a dependency for ALL question types, not merely
  // Multiple Dropdowns. The answer key may be valid, but the exam is not ready.
  if(group.feedbackExpected && !String(group.feedback||"").trim())
    question.issues.push({level:"review",code:"source_feedback_missing",text:"The Word source declares Set feedback, but no feedback was imported for this question."});
  if((group.parseIssues||[]).some(i=>/Set feedback|General feedback/i.test(i.text||"") && /not classified|missing|unrecognized/i.test(i.text||"") &&
      !(i.level==="review" && bankIssueReviewed(group,i))))
    question.issues.push({level:"review",code:"source_feedback_unclassified",text:"Set feedback was found in the source but was not classified. Recover and verify the feedback."});
  if (group.requiresImage && !canonicalCdnImageUrl(group.imageUrl || "") && !hasQuestionImage(question))
    question.issues.push({level:"review",text:"Shared image is pending. Insert the verified labeled image before publishing."});
  if (unresolvedQuestionImageReference(question,group))
    question.issues.push({level:"review",code:"missing_question_image",text:"The source question refers to a picture or diagram, but no image was provided. Insert and verify the image before publishing."});
  const sourcePoints=group.sourcePointsPerQuestion;
  if (sourcePoints!=null && Number(question.points===""||question.points==null?dom.defaultPoints.value:question.points)!==sourcePoints)
    question.issues.push({level:"review",code:"source_points_mismatch",text:`Word specifies ${sourcePoints} points per question; this item is configured differently. Confirm or adjust its points.`});

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
    // VALID-070-H: An unusual source-label sequence (A/B/C/E) is a
    // document-editor review, not necessarily a missing QTI answer choice.
    // Keep all answer text and the established correct key intact.
    const labels=question.choices.map(c=>String(c.label||"").toUpperCase());
    if(labels.some((label,i)=>label!==String.fromCharCode(65+i))){
      question.issues.push({level:"review",code:"choice_sequence_gap",
        text:"Answer labels are not sequential (for example A/B/C/E). Verify the source labels without changing the correct answer."});
    }
    const sourceEvidence=question.sourceChoiceEvidence;
    if(sourceEvidence && question.choices.length<sourceEvidence.count)
      question.issues.push({level:"correction",code:"source_answer_options_missing",
        text:`Word contains ${sourceEvidence.count} source answer options but only ${question.choices.length} remain in this question. Restore the missing options and remove any displaced option text from the stem.`});
    // Do not accept numeric auto-list answer text left inside the question stem.
    const unresolvedAuto=(question.sourceEvents||[]).some(e=>
      e.kind==="numbered-list" && e.automaticNumbering &&
      !qtiQuestionStemCandidate(e.text) &&
      question.choices.length>0 && textFromHtml(question.stem).includes(e.text));
    if(unresolvedAuto)
      question.issues.push({level:"correction",code:"unresolved_auto_list_answer",
        text:"A numbered Word-list entry remains in the question stem instead of the answer choices. Restore the original option structure."});
    // Preserve original-source merged-block evidence through Save Changes.
    // Re-labeling eight choices as A-H is not equivalent to splitting two items.
    if(question.parseIssues?.some(i=>i.code==="merged_answer_blocks")){
      const expected=group.expectedQuestionCount;
      const firstBlock=question.sourceChoiceEvidence?.choices||[];
      const nextA=firstBlock.findIndex((c,i)=>i>0&&c.label==="A");
      const maxOptions=nextA>0?nextA:4;
      const structurallyRepaired=question.choices.length<=maxOptions &&
        expected!=null && group.questions.length>=expected &&
        question.choices.length>=2 && !/\b\d+\s*[.)]\s+(?:which|what|how|select|identify)\b/i.test(textFromHtml(question.stem));
      if(structurallyRepaired)
        question.issues=question.issues.filter(i=>i.code!=="merged_answer_blocks");
    }
    if(question.choices.some(c=>!textFromHtml(c.html).trim())){
      question.issues.push({level:"correction",code:"empty_answer_choice",
        text:"One or more answer choices have empty text."});
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
      const key = normalizeSpaces(textFromHtml(choice.html)).toLowerCase()+
        (/<(?:em|i|strong|b|u)\b/i.test(choice.html) ? "|rich:"+String(choice.html).replace(/\s+/g," ").toLowerCase() : "");
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
      if ((blank.options||[]).some(o=>!String(o.text||"").trim())) question.issues.push({level:"correction",text:`Dropdown ${blank.id} has an empty answer option.`});
      const correct=(blank.options||[]).filter(o=>o.correct);
      if (correct.length !== 1) question.issues.push({level:"correction",text:`Dropdown ${blank.id} requires exactly one correct option (found ${correct.length}).`});
      if (new Set((blank.options||[]).map(o=>o.text.toLowerCase().trim())).size !== (blank.options||[]).length) question.issues.push({level:"correction",text:`Dropdown ${blank.id} contains duplicate options.`});
    }

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
  // VALID-075 / VALID-071: issues that depend on the CURRENT bank contents are
  // recalculated here instead of staying frozen from import time. Their text
  // and level at import are unchanged from v3.16.
  const liveCodes=new Set(["missing_source_questions","possible_question_merge","group_numbering_gap"]);
  const waivable=[];
  const addWaivable=issue=>{waivable.push(issue);if(!bankIssueReviewed(group,issue))group.issues.push(issue);};
  group.issues=[];
  for(const issue of group.parseIssues||[]){
    if(liveCodes.has(issue.code))continue;
    if(issue.level==="review")addWaivable(issue);else group.issues.push(issue);
  }
  for(const issue of group.liveNumberingGaps||[])addWaivable(issue);
  const counts=qtiLiveQuestionCounts(group);
  // Questions intentionally deleted by the instructor are recorded separately
  // and must not be mistaken for original DOCX extraction losses.
  const sourceAccounted=counts.fromSource+counts.deletedFromSource;
  const present=sourceAccounted+counts.addedHere;
  let underReported=false;
  if((group.independentMcQuestionCount||0)>=2 && present<group.independentMcQuestionCount){
    underReported=true;
    group.issues.push({level:"correction",code:"missing_source_questions",
      text:`Some questions may be missing: the document contains at least ${group.independentMcQuestionCount} numbered questions with answer options, but only ${present} were imported.`});
  }
  if((group.sourceNumberedQuestionCount||0)>=2 && present<group.sourceNumberedQuestionCount){
    underReported=true;
    group.issues.push({level:"correction",code:"possible_question_merge",
      text:`Possible question merge: ${group.sourceNumberedQuestionCount} numbered question openings were found, but only ${present} question(s) were created.`});
  }
  if(group.expectedQuestionCount!=null){
    const expected=group.expectedQuestionCount;
    if(sourceAccounted>expected)
      group.issues.push({level:"correction",code:"possible_question_split",
        text:`Possible segmentation error: the Word source shows ${expected} question(s) with answer options in this bank, but ${sourceAccounted} source question(s) were recovered or explicitly deleted. Repair the split rather than confirming this as a review note.`});
    else if(sourceAccounted<expected && !underReported)
      group.issues.push({level:"correction",code:"question_count_mismatch",
        text:`Possible merged or missing source question: the Word source shows ${expected} answer block(s) in this bank, but only ${sourceAccounted} source question(s) are accounted for. Moving questions between banks does not alter their source ownership.`});
  }
  if(group.trailingFeedbackCandidate && !textFromHtml(group.feedback||""))
    addWaivable({level:"review",code:"trailing_feedback_ambiguous",
      text:"A Feedback paragraph follows the last question of this bank and was kept as that question's feedback. If it is Group Feedback for the whole bank, move it to the Group feedback field."});
  group.waivableIssues=waivable;
  if(group.feedbackExpected && !group.feedback.trim())group.issues.push({level:"review",code:"source_feedback_missing",text:"The source declares Set Feedback, but its content was not imported."});
  if(group.feedbackImagePending && !canonicalCdnImageUrl(group.feedbackImageUrl || ""))
    group.issues.push({level:"review",text:"The feedback image is pending. Add the verified image before publishing."});
  if (group.requiresImage && !canonicalCdnImageUrl(group.imageUrl || "") &&
      !group.questions.every(question=>hasQuestionImage(question)))
    group.issues.push({level:"review",text:"A shared image was requested; one or more questions still lack an embedded image or a verified shared image URL."});
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
  // v3.17 messages are already written for the reviewer; show them verbatim.
  if(/^(?:Possible segmentation error|Possible merged or missing question|A Feedback paragraph follows|Answer option labels repeat|An answer option contains text|The question stem contains answer labels|Set feedback appears more than once)/.test(text))
    return text;
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
    issue.code==="format_based_answer" ||
    issue.code==="option_contains_question" || issue.code==="stem_contains_answer_labels" ||
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
    if(isManualReviewIssue(issue) || issue.code==="merged_answer_blocks" ||
       issue.code==="source_answer_options_missing" || issue.code==="unresolved_auto_list_answer")return true;
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
  state.search="";state.filter="all";state.questionTypeFilter="all";state.unitFilter="all";state.lessonFilter="all";
  state.issueFilter="all";state.feedbackFilter="all";
  dom.searchBox.value="";dom.questionTypeFilter.value="all";dom.unitFilter.value="all";dom.lessonFilter.value="all";
  document.querySelectorAll(".filter-card").forEach(el=>el.classList.toggle("active",el.dataset.filter==="all"));
  renderAll();
}
function renderDynamicFilters(){
  const groups=state.groups.filter(g=>!isDiagnosticGroup(g));
  const units=[...new Set(groups.map(g=>g.unit))].sort();
  dom.unitFilter.innerHTML='<option value="all">All units</option>'+units.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(state.unitFilter!=="all"&&!units.includes(state.unitFilter))state.unitFilter="all";
  dom.unitFilter.value=state.unitFilter;
  const lessonGroups=groups.filter(g=>state.unitFilter==="all"||g.unit===state.unitFilter);
  const lessons=[...new Set(lessonGroups.map(g=>g.lesson))].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
  dom.lessonFilter.innerHTML='<option value="all">All lessons</option>'+lessons.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(state.lessonFilter!=="all"&&!lessons.includes(state.lessonFilter))state.lessonFilter="all";
  dom.lessonFilter.value=state.lessonFilter;
  const typeTotals=new Map();
  groups.filter(g=>(state.unitFilter==="all"||g.unit===state.unitFilter)&&
    (state.lessonFilter==="all"||g.lesson===state.lessonFilter)).forEach(g=>g.questions.forEach(q=>{
      const type=questionCategory(q);typeTotals.set(type,(typeTotals.get(type)||0)+1);
    }));
  const typeNames={multiple_choice:"Multiple Choice",multiple_answers:"Multiple Answers",
    multiple_choice_images:"Multiple Choice with Images",matching:"Matching",multiple_dropdowns:"Multiple Dropdowns",true_false:"True / False"};
  dom.questionTypeFilter.innerHTML='<option value="all">All question types ('+[...typeTotals.values()].reduce((a,b)=>a+b,0)+')</option>'+
    Object.entries(typeNames).filter(([id])=>typeTotals.get(id)).map(([id,label])=>
      `<option value="${id}">${label} (${typeTotals.get(id)})</option>`).join("");
  if(state.questionTypeFilter!=="all"&&!typeTotals.has(state.questionTypeFilter))state.questionTypeFilter="all";
  dom.questionTypeFilter.value=state.questionTypeFilter;
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
  return (state.unitFilter==="all"||group.unit===state.unitFilter) &&
    (state.lessonFilter==="all"||group.lesson===state.lessonFilter) &&
    (state.filter === "all" || question.status === state.filter) &&
    (state.questionTypeFilter === "all" || questionCategory(question) === state.questionTypeFilter) &&
    (state.issueFilter === "all" || issueTagsForQuestion(group,question).has(state.issueFilter)) &&
    (state.feedbackFilter !== "no_feedback" || !generalFeedbackHtml(question,group).trim()) &&
    matchesSearch(group, question);
}
// When a bank is flagged for review/correction, selecting its status must show
// ALL questions inside the bank. A question's own status remains unchanged.
// Granular type/issue/feedback filters continue to apply when explicitly set.
function showEntireFlaggedBank(group){
  return (state.filter==="review"||state.filter==="correction") && group.status===state.filter &&
    state.issueFilter==="all" && state.questionTypeFilter==="all" && state.feedbackFilter==="all";
}
function visibleQuestionItems(group){
  return group.questions.filter(q=>showEntireFlaggedBank(group)
    ? matchesSearch(group,q)
    : matchesFilters(group,q));
}
function visibleGroups() {
  return state.groups.filter(group=>{
    if(state.unitFilter!=="all"&&group.unit!==state.unitFilter)return false;
    if(state.lessonFilter!=="all"&&group.lesson!==state.lessonFilter)return false;
    // Structural bank-level errors must remain discoverable when filtering
    // Needs Review / Needs Correction, even if every question is individually Good.
    if(showEntireFlaggedBank(group))return !state.search ||
      group.questions.some(q=>matchesSearch(group,q)) ||
      matchesSearch(group,{itemTitle:"",stem:"",choices:[],pairs:[],blanks:[]});
    if(!group.questions.length)return state.issueFilter==="all"&&state.feedbackFilter!=="no_feedback" &&
      state.filter==="all"&&state.questionTypeFilter==="all"&&matchesSearch(group,{itemTitle:"",stem:"",choices:[],pairs:[],blanks:[]});
    return visibleQuestionItems(group).length>0;
  });
}
function filteredQuestions() {
  const groups = visibleGroups();
  const activeGroup = groups.find(g=>g.id===state.selectedBankId) || groups[0];
  if (!activeGroup) return {group:null,items:[]};
  return {group:activeGroup,items:visibleQuestionItems(activeGroup)};
}

function renderAll() {
  renderDynamicFilters();
  renderIssueFilterBars();
  renderCounts();
  renderBankList();
  renderQuestionList();
  renderEditor();
  renderPreview();
  renderValidationPanel();
  renderFiles();
  renderSummaryOverview();
  updateNextQuestionButton();
}

function renderSummaryOverview() {
  const questions=state.groups.flatMap(group=>group.questions);
  const corrected=questions.filter(q=>q.status==="correction").length;
  const review=questions.filter(q=>q.status==="review").length;
  const groupsWithErrors=state.groups.filter(g=>g.status==="correction").length;
  dom.setupBankCount.textContent=state.groups.filter(g=>!isDiagnosticGroup(g)).length;
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
  const academicBanks=state.groups.filter(g=>!isDiagnosticGroup(g)).length;
  const diagnostics=state.groups.length-academicBanks;
  dom.bankCountPill.textContent = `${academicBanks} bank${academicBanks===1?"":"s"}`+(diagnostics?` · ${diagnostics} source issue${diagnostics===1?"":"s"}`:"");

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
      <div class="bank-card-meta">${visibleQuestionItems(group).length} of ${group.questions.length} shown · ${esc(group.sourceName)}</div>
      ${!isDiagnosticGroup(group)?`<div class="bank-manage-actions">
        <button type="button" class="small-btn" data-edit-group="${esc(group.id)}">Edit Group</button>
        <button type="button" class="small-btn" data-reorder-group="up" data-bank-action-id="${esc(group.id)}" aria-label="Move group up">↑</button>
        <button type="button" class="small-btn" data-reorder-group="down" data-bank-action-id="${esc(group.id)}" aria-label="Move group down">↓</button>
        ${group.questions.length===0?`<button type="button" class="small-btn danger-action" data-delete-empty-group="${esc(group.id)}">Delete Empty</button>`:""}
      </div>`:""}
      ${bankBadgeMarkup(group)}
      ${(group.issues||[]).filter(i=>!/ contains critical issues\.$| needs review\.$/.test(i.text||"")).length ?
        `<div class="bank-structural-issues"><strong>Bank Issues (${(group.issues||[]).filter(i=>!/ contains critical issues\.$| needs review\.$/.test(i.text||"")).length})</strong>${(group.issues||[]).filter(i=>!/ contains critical issues\.$| needs review\.$/.test(i.text||"")).slice(0,2).map(i=>`<p>${esc(friendlyValidationMessage(i))}</p>`).join("")}</div>` : ""}
      <div class="bank-issue-counts">${ISSUE_TAGS.map(t=>{
        const n=group.questions.filter(q=>issueTagsForQuestion(group,q).has(t.id)).length;
        return n?`<span class="bank-issue-chip">${esc(t.label)} ${n}</span>`:"";
      }).join("")}</div>
    </div>
  `).join("");

  dom.bankList.querySelectorAll("[data-bank-id]").forEach(card => {
    card.addEventListener("click", (event) => {
      const manage=event.target.closest("[data-edit-group], [data-reorder-group], [data-delete-empty-group]");
      if(manage){
        event.stopPropagation();
        if(manage.dataset.editGroup)openGroupEditor("edit",manage.dataset.editGroup);
        else if(manage.dataset.deleteEmptyGroup)deleteEmptyGroup(manage.dataset.deleteEmptyGroup);
        else reorderGroup(manage.dataset.bankActionId,manage.dataset.reorderGroup);
        return;
      }
      if(!confirmLeaveUnsavedEditor())return;
      state.selectedBankId = card.dataset.bankId;
      const targetGroup = state.groups.find(group => group.id === state.selectedBankId);
      state.selectedQuestionId = visibleQuestionItems(targetGroup)[0]?.id || null;
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
    state.selectedQuestionId=null;
    const statusOnly=(state.filter==="review"||state.filter==="correction") && group.status===state.filter;
    dom.questionList.innerHTML=statusOnly?`<div class="bank-structural-issues"><strong>Bank-level ${state.filter==="review"?"review":"correction"} issue — no individual questions flagged</strong>${(group.issues||[]).filter(i=>!/ contains critical issues\.$| needs review\.$/.test(i.text||"")).map(i=>`<p>${esc(friendlyValidationMessage(i))}</p>`).join("")}</div>`:
      `<div class="empty-state">No questions match the selected filters.</div>`;
    return;
  }

  if (!items.some(item => item.id === state.selectedQuestionId)) {
    state.selectedQuestionId = items[0]?.id || null;
  }

  const bankIssueBanner=(group.status!=="good" && (group.issues||[]).some(i=>
    !/ contains critical issues\.$| needs review\.$/.test(i.text||""))) ?
    `<div class="bank-structural-issues"><strong>Bank issues (${group.status==="review"?"Review":"Correction"})</strong>${(group.issues||[])
      .filter(i=>!/ contains critical issues\.$| needs review\.$/.test(i.text||"")).map(i=>`<p>${esc(friendlyValidationMessage(i))}</p>`).join("")}</div>`:"";
  dom.questionList.innerHTML = bankIssueBanner + items.map(question => `
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
        <label class="question-move-select"><input type="checkbox" data-select-question="${esc(question.id)}" ${state.selectedForMove.has(question.id)?"checked":""} aria-label="Select ${esc(question.itemTitle)} to move"> Select</label>
        <button class="small-btn" data-move-to-group="${esc(question.id)}">Move to Group</button>
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
  if (!group || !filteredQuestions().items.some(q=>q.id===question.id)) return;
  if(questionId!==state.selectedQuestionId && !confirmLeaveUnsavedEditor())return;
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
  updateNextQuestionButton();
}

dom.questionList.addEventListener("click", event => {
  const selection=event.target.closest("input[data-select-question]");
  if(selection){
    if(selection.checked)state.selectedForMove.add(selection.dataset.selectQuestion);
    else state.selectedForMove.delete(selection.dataset.selectQuestion);
    return;
  }
  const transfer=event.target.closest("button[data-move-to-group]");
  if(transfer){state.selectedForMove=new Set([transfer.dataset.moveToGroup]);openQuestionMoveDialog();return;}
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
  if(event.target.closest(".question-move-select"))return;
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
    // Converting Multiple Answers -> Multiple Choice must never silently
    // choose one of the multiple marked correct answers. Require a fresh pick.
    const convertedChoices=nextType==="multiple_choice_question"&&correctCount>1
      ?answerChoices.map(c=>({...c,correct:false})) : answerChoices;
    return {choices:convertedChoices.length>=2?convertedChoices:[...convertedChoices,...Array.from({length:2-convertedChoices.length},()=>({label:"",html:"",correct:false}))],
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
function formattingToolbar(fieldId){
  const actions=[
    ["bold","B","Bold (select text first)"],
    ["italic","I","Italic (select text first)"],
    ["ul","• List","Bulleted list (select lines first)"],
    ["ol","1. List","Numbered list (select lines first)"],
    ...(fieldId==="editStem"?[["image","▣ Image","Insert an embedded image URL at the cursor"]]:[])
  ];
  return `<div class="html-format-toolbar" role="toolbar" aria-label="HTML formatting tools">${actions.map(([action,label,title])=>
    `<button class="format-action format-${action}" type="button" data-format-action="${action}" data-format-field="${fieldId}" title="${esc(title)}" aria-label="${esc(title)}">${label}</button>`).join("")}</div>`;
}
function htmlListItemsFromSelection(selected){
  const raw=selected.trim();
  const doc=new DOMParser().parseFromString(`<div id="qti-selection">${raw}</div>`,"text/html");
  const root=doc.getElementById("qti-selection");
  const nodes=[...root.children];
  if(nodes.length>0 && nodes.every(el=>["P","LI"].includes(el.tagName)) &&
    [...root.childNodes].every(node=>node.nodeType===1 || !(node.textContent||"").trim()))
    return nodes.map(el=>el.innerHTML.trim()).filter(Boolean);
  return selected.replace(/<br\s*\/?>/gi,"\n").split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
    .map(x=>x.replace(/^<p[^>]*>/i,"").replace(/<\/p>$/i,""));
}
function validEditorImageUrl(value){
  try{const url=new URL(String(value||"").trim());return url.protocol==="https:"&&
    /\.(?:png|jpe?g|gif|webp|svg)$/i.test(url.pathname)?url.href:null;}
  catch(_){return null;}
}
function insertImageAtCursor(textarea,url,alt){
  const safe=validEditorImageUrl(url);
  if(!safe)return false;
  const insertion=`<img src="${esc(safe)}" alt="${esc(alt||"")}" width="640" />`;
  textarea.setRangeText(insertion,textarea.selectionStart,textarea.selectionEnd,"end");
  textarea.dispatchEvent(new Event("input",{bubbles:true}));textarea.focus();return true;
}
function openImageDialog(textarea){
  const dialog=document.getElementById("insertImageDialog"),urlInput=document.getElementById("insertImageUrl"),altInput=document.getElementById("insertImageAlt");
  const start=textarea.selectionStart,end=textarea.selectionEnd;
  urlInput.value="";altInput.value="";
  dialog.showModal();urlInput.focus();
  document.getElementById("insertImageConfirm").onclick=()=>{
    const value=validEditorImageUrl(urlInput.value);
    if(!value){urlInput.setCustomValidity("Enter a valid HTTPS image URL ending in PNG, JPG, GIF, WebP or SVG.");urlInput.reportValidity();return;}
    urlInput.setCustomValidity("");textarea.setSelectionRange(start,end);
    insertImageAtCursor(textarea,value,altInput.value);dialog.close();
  };
  document.getElementById("insertImageCancel").onclick=()=>dialog.close();
  urlInput.oninput=()=>urlInput.setCustomValidity("");
}
function formatSelectedHtmlField(textarea,action){
  const start=textarea.selectionStart,end=textarea.selectionEnd;
  if(start===end){setStatus("Select the text or lines you want to format first.","review");textarea.focus();return false;}
  const selected=textarea.value.slice(start,end);
  // Do not wrap partial HTML tags: doing so can destroy Word formatting.
  const before=textarea.value.slice(0,start);
  if(before.lastIndexOf("<")>before.lastIndexOf(">") || selected.includes("<")!==selected.includes(">") ||
      ((selected.match(/</g)||[]).length!==(selected.match(/>/g)||[]).length)){
    setStatus("Select only text or complete HTML elements before formatting.","review");textarea.focus();return false;
  }
  let replacement;
  if(action==="bold"||action==="italic"){
    const tag=action==="bold"?"strong":"em";
    replacement=`<${tag}>${selected}</${tag}>`;
  }else if(action==="ul"||action==="ol"){
    const lines=htmlListItemsFromSelection(selected);
    if(!lines.length)return false;
    const li=lines.map(line=>`<li>${line.replace(/^<p[^>]*>/i,"").replace(/<\/p>$/i,"")}</li>`).join("\n");
    replacement=`<${action}>\n${li}\n</${action}>`;
  }else return false;
  textarea.setRangeText(replacement,start,end,"select");
  textarea.dispatchEvent(new Event("input",{bubbles:true}));
  textarea.focus();
  return true;
}
function editorFormFingerprint(){
  if(!dom.editorPanel.querySelector("#editStem"))return "";
  const nodes=dom.editorPanel.querySelectorAll("input,textarea,select");
  return JSON.stringify([...nodes].filter(x=>x.id!=="confirmAnswersCheckbox")
    .map(el=>[el.id,el.name,el.dataset.choiceText,el.dataset.blankOptions,el.type==="checkbox"||el.type==="radio"?el.checked:el.value]));
}
let editorBaselineFingerprint="";
function confirmLeaveUnsavedEditor(){
  if(!editorBaselineFingerprint||editorFormFingerprint()===editorBaselineFingerprint)return true;
  return window.confirm("You have unsaved changes in Step 4. Leave this question without saving? Use Save Changes first to keep your edits.");
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
      <p class="validation-help">Each blank needs a [blankId] in Stem HTML. Choose exactly one correct answer using its radio button. Edit, add, or delete options individually.</p>
      ${(question.blanks||[]).map((b,i)=>`<div class="dropdown-editor-row"><div class="dropdown-editor-head"><strong>${esc(friendlyDropdownLabel(b,i))}</strong><small class="validation-help">Internal ID: ${esc(b.id)}</small><button type="button" class="small-btn" data-delete-blank="${i}">Delete</button></div>
        <label class="field"><span>Blank ID</span><input data-blank-id="${i}" value="${esc(b.id)}"></label>
        <label class="field"><span>Label / prompt</span><input data-blank-prompt="${i}" value="${esc(b.prompt)}"></label>
        <div class="dropdown-answer-options" role="group" aria-label="Answer options for ${esc(b.prompt||b.id)}">
          ${(b.options||[]).map((o,j)=>`<div class="dropdown-answer-row">
            <label class="dropdown-answer-radio"><input type="radio" name="dropdown_correct_${i}" data-dropdown-correct="${i}" value="${j}" ${o.correct?"checked":""} aria-label="Mark option ${j+1} correct"><span>${j+1}.</span></label>
            <input type="text" data-dropdown-option="${i}" data-option-index="${j}" value="${esc(o.text)}" aria-label="Option ${j+1} text" placeholder="Answer option" />
            <button type="button" class="icon-btn" data-delete-dropdown-option="${i}" data-option-index="${j}" aria-label="Delete option ${j+1}">Delete</button>
          </div>`).join("")}
          <button type="button" class="small-btn" data-add-dropdown-option="${i}">+ Add option</button>
        </div>
      </div>`).join("")}
      <button class="small-btn" type="button" id="addBlankBtn">Add dropdown blank</button></div>`;
  } else if(["multiple_choice_question","multiple_answers_question","true_false_question"].includes(question.type)) {
    inputMarkup=`<div class="editor-group"><h3>Choices</h3><div id="choiceContainer">
      ${(question.choices||[]).map((c,i)=>`<div class="choice-row"><div class="mini-label">${String.fromCharCode(65+i)}</div>
        <input type="text" data-choice-text="${i}" value="${esc(textFromHtml(c.html))}" placeholder="Answer choice">
        <label class="toggle"><input type="${question.type==="multiple_answers_question"?"checkbox":"radio"}" name="${question.type==="multiple_answers_question"?`choice_${i}`:"single_correct_choice"}" data-choice-correct="${i}" ${c.correct?"checked":""}><span>Correct</span></label>
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
      <label class="field"><span>Stem HTML</span>${formattingToolbar("editStem")}<textarea id="editStem" rows="6">${esc(question.stem||"")}</textarea><small class="validation-help">HTML tags and CDN images are preserved.</small></label>
    </div>
    ${inputMarkup}
    <div class="editor-group"><h3>Feedback</h3>
      <label class="field"><span>Question rationale / feedback</span>${formattingToolbar("editFeedback")}<textarea id="editFeedback" rows="4">${esc(question.feedback||"")}</textarea></label>
      ${question.type==="matching_question"?`<label class="field"><span>Matching explanations (one per line)</span><textarea id="editMatchingNotes" rows="4">${esc((question.matchingNotes||[]).map(x=>textFromHtml(x)).join("\n"))}</textarea></label>`:""}
      ${group.requiresImage?`<label class="field"><span>Shared image URL (student question stem)</span><input id="editSharedImage" type="url" placeholder="https://cdn-media..." value="${esc(group.imageUrl||"")}"></label>`:""}
      ${group.feedbackImagePending?`<label class="field"><span>Feedback image URL (optional, separate from the shared stem image)</span><input id="editFeedbackImage" type="url" placeholder="https://cdn-media..." value="${esc(group.feedbackImageUrl||"")}"></label>`:""}
      <label class="field"><span>Group feedback (applied to every question)</span>${formattingToolbar("editGroupFeedback")}<textarea id="editGroupFeedback" rows="4">${esc(group.feedback||"")}</textarea></label>
    </div>
    <div class="editor-group internal-notes-panel"><h3>Internal Notes (Not Exported)</h3>
      <p class="validation-help">Word comments and instructor notes are for review only. They never appear in the student question or the QTI package.</p>
      ${[...(group.teacherNotes||[]),...(question.internalNotes||[])].length?
        [...(group.teacherNotes||[]),...(question.internalNotes||[])].map(t=>`<p class="internal-note-item">${esc(t)}</p>`).join(""):
        '<p class="validation-help">No internal notes associated with this question or bank.</p>'}
    </div>
    ${false && hasManualReviewIssue(question) && !question.reviewConfirmed ? `<label class="manual-review-confirm">
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
  dom.editorPanel.querySelectorAll("[data-format-action]").forEach(button=>{
    button.addEventListener("mousedown",event=>event.preventDefault());
    button.addEventListener("click",()=>{
      const target=dom.editorPanel.querySelector(`#${button.dataset.formatField}`);
      if(target){if(button.dataset.formatAction==="image")openImageDialog(target);else formatSelectedHtmlField(target,button.dataset.formatAction);}
    });
  });
  editorBaselineFingerprint=editorFormFingerprint();
  const readForm=()=>{
    const title=document.getElementById("editItemTitle").value.trim();
    question.customTitle=Boolean(title&&title!==questionTitleFromGroupTitle(group.title,question.index));
    question.itemTitle=title||questionTitleFromGroupTitle(group.title,question.index);
    question.points=document.getElementById("editPoints").value;
    question.stem=normalizeQuestionStemHtml(document.getElementById("editStem").value);
    question.feedback=safeFeedbackHtml(document.getElementById("editFeedback").value);
    group.feedback=safeFeedbackHtml(document.getElementById("editGroupFeedback").value);
    const image=document.getElementById("editSharedImage");if(image)group.imageUrl=image.value.trim();
    const feedbackImage=document.getElementById("editFeedbackImage");if(feedbackImage)group.feedbackImageUrl=feedbackImage.value.trim();
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
        options:[...dom.editorPanel.querySelectorAll(`[data-dropdown-option="${i}"]`)].map((field,j)=>({
          text:field.value.trim(),correct:!!dom.editorPanel.querySelector(`[data-dropdown-correct="${i}"][value="${j}"]`)?.checked
        }))
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
    // Compare academic answer content, not presentation labels: readForm()
    // reletters A/B/C even when the user clicked Save without editing. Such
    // normalization is NOT evidence that a parser error was repaired.
    const substantive=q=>JSON.stringify([q.type,
      (q.choices||[]).map(c=>[textFromHtml(c.html),!!c.correct]),q.pairs,q.blanks]);
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
      // WORKFLOW-055: Save Changes is explicit human sign-off for parser-only
      // ambiguity. Real content/media/answer errors cannot be waived.
      if(hasManualReviewIssue(question))question.reviewConfirmed=true;
      reconcileManualParserIssues(question,changed);
    }
    if(rerender){
      refreshReviewAfterEdit(draft?"Draft saved. Review and select Save Changes when ready.":
        question.reviewConfirmed?"Answers confirmed. The question status and bank counts were updated.":
          "Changes saved and validated. Remaining source issues are shown if present.",
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
  dom.editorPanel.querySelectorAll("[data-add-dropdown-option]").forEach(btn=>btn.onclick=()=>{
    readForm();const blank=question.blanks[Number(btn.dataset.addDropdownOption)];
    if(blank){blank.options.push({text:"",correct:false});renderEditor();}
  });
  dom.editorPanel.querySelectorAll("[data-delete-dropdown-option]").forEach(btn=>btn.onclick=()=>{
    readForm();const blank=question.blanks[Number(btn.dataset.deleteDropdownOption)];
    const index=Number(btn.dataset.optionIndex);
    if(blank?.options[index]){
      if(blank.options[index].correct && !window.confirm("Delete the correct option? This dropdown will require a new correct answer."))return;
      blank.options.splice(index,1);renderEditor();
    }
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
      // Converting type must not erase verified source-structure failures.
      question.parseIssues=(question.parseIssues||[]).filter(issue=>
        ["merged_answer_blocks","source_answer_options_missing","unresolved_auto_list_answer"].includes(issue.code));
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

function adjacentVisibleQuestion(direction){
  const eligible=visibleGroups().flatMap(g=>visibleQuestionItems(g));
  const index=eligible.findIndex(q=>q.id===state.selectedQuestionId);
  return index>=0?eligible[index+direction]||null:null;
}
function nextVisibleQuestion(){return adjacentVisibleQuestion(1);}
function previousVisibleQuestion(){return adjacentVisibleQuestion(-1);}
function updateNextQuestionButton(){
  if(!dom.nextQuestionBtn)return;
  dom.nextQuestionBtn.disabled=!nextVisibleQuestion();
  dom.previousQuestionBtn.disabled=!previousVisibleQuestion();
}
function navigateVisibleQuestion(direction){
  const target=adjacentVisibleQuestion(direction);
  if(!target)return;
  if(!confirmLeaveUnsavedEditor())return;
  const group=state.groups.find(g=>g.id===target.groupId);
  if(!group)return;
  const bankChanged=group.id!==state.selectedBankId;
  state.selectedBankId=group.id;state.selectedQuestionId=target.id;
  if(bankChanged){renderBankList();renderQuestionList();}
  else dom.questionList.querySelectorAll("[data-question-id]").forEach(card=>{
    const active=card.dataset.questionId===target.id;
    card.classList.toggle("selected",active);card.setAttribute("aria-current",String(active));
  });
  renderEditor();renderPreview();renderValidationPanel();updateNextQuestionButton();
  dom.questionList.querySelector(`[data-question-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({block:"nearest",behavior:"smooth"});
}
dom.nextQuestionBtn.addEventListener("click",()=>navigateVisibleQuestion(1));
dom.previousQuestionBtn.addEventListener("click",()=>navigateVisibleQuestion(-1));
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
// GROUP-069: group identities remain stable. Changing display order/number only
// updates unit/lesson/group labels, never question IDs or answer data.
function sameLessonGroups(group){return state.groups.filter(g=>
  !isDiagnosticGroup(g)&&g.sourceName===group.sourceName&&g.unit===group.unit&&g.lesson===group.lesson);}
function renumberLesson(unit,lesson,sourceName){
  state.groups.filter(g=>!isDiagnosticGroup(g)&&g.sourceName===sourceName&&g.unit===unit&&g.lesson===lesson)
    .forEach((g,i)=>g.number=i+1);
}
function reopenReviewAfterGroupChange(message){
  state.validation=null;
  revalidateAll();renderAll();setStatus(message,"good");
}
function openGroupEditor(mode,bankId=null,moveSelectionAfterCreate=false){
  if(!confirmLeaveUnsavedEditor())return;
  const group=state.groups.find(g=>g.id===bankId);
  const reference=group||selectedBankForManage();
  const dialog=document.getElementById("editGroupDialog");
  const unit=document.getElementById("groupEditorUnit");
  const lesson=document.getElementById("groupEditorLesson");
  const number=document.getElementById("groupEditorNumber");
  const title=document.getElementById("groupEditorName");
  document.getElementById("groupEditorTitle").textContent=mode==="edit"?"Edit Group":"Create Group";
  unit.value=group?.unit||reference?.unit||"U1";
  lesson.value=group?.lesson||reference?.lesson||"L1";
  number.value=group?.number||((reference?Math.max(0,...sameLessonGroups(reference).map(g=>g.number)):0)+1);
  title.value=group?.title||"";
  document.getElementById("groupEditorFeedback").value=group?.feedback||"";
  // VALID-075: explicit sign-off for review-level bank notes. Critical
  // (correction) bank errors are never listed here and cannot be waived.
  const reviewRow=document.getElementById("groupEditorReviewRow");
  const reviewBox=document.getElementById("groupEditorReviewed");
  const reviewNotes=mode==="edit"&&group?(group.waivableIssues||[]):[];
  reviewRow.hidden=!reviewNotes.length;
  reviewBox.checked=reviewNotes.length>0 && reviewNotes.every(issue=>bankIssueReviewed(group,issue));
  document.getElementById("groupEditorReviewNotes").innerHTML=reviewNotes.map(issue=>`<li>${esc(issue.text)}</li>`).join("");
  dialog.showModal();title.focus();
  document.getElementById("groupEditorCancel").onclick=()=>dialog.close();
  document.getElementById("groupEditorSave").onclick=()=>{
    const u=unit.value.trim().toUpperCase(),l=lesson.value.trim().toUpperCase();
    const n=Number(number.value),name=title.value.trim();
    if(!/^U\d+$/.test(u)||!/^L\d+$/.test(l)||!Number.isInteger(n)||n<1||!name){
      window.alert("Enter a name, Unit (e.g. U1), Lesson (e.g. L3), and a positive group number.");return;
    }
    const edited=mode==="edit"&&group;
    const sourceName=reference?.sourceName||"Manual bank";
    const destination=state.groups.filter(g=>!isDiagnosticGroup(g)&&g!==group&&g.sourceName===sourceName&&g.unit===u&&g.lesson===l);
    if(destination.some(g=>g.number===n) && edited && (group.unit!==u||group.lesson!==l||group.number!==n)){
      if(!window.confirm("The destination group number exists. Move and renumber groups in that unit/lesson?"))return;
    }
    const priorUnit=group?.unit, priorLesson=group?.lesson, priorSource=group?.sourceName;
    let saved=group;
    if(edited){
      const oldIndex=state.groups.indexOf(group);
      state.groups.splice(oldIndex,1);
      saved.title=name;saved.unit=u;saved.lesson=l;saved.feedback=safeFeedbackHtml(document.getElementById("groupEditorFeedback").value);
      if(!reviewRow.hidden)saved.reviewedBankIssues=reviewBox.checked?reviewNotes.map(issue=>issue.text):[];
      // Preserve group ID and all questions, and preserve source parse issues.
    } else {
      saved={id:`bank_manual_${++state.idSequence}_${Date.now()}`,sourceName:reference?.sourceName||"Manual bank",
        title:name,unit:u,lesson:l,number:n,feedback:safeFeedbackHtml(document.getElementById("groupEditorFeedback").value),
        questions:[],parseIssues:[],issues:[],status:"good",teacherNotes:[],requiresImage:false,imageUrl:"",forceDropdown:false};
    }
    const peers=state.groups.filter(g=>!isDiagnosticGroup(g)&&g.sourceName===sourceName&&g.unit===u&&g.lesson===l);
    const offset=Math.max(0,Math.min(n-1,peers.length));
    const insertBefore=peers[offset];
    const index=insertBefore?state.groups.indexOf(insertBefore):(
      peers.length?state.groups.indexOf(peers[peers.length-1])+1:state.groups.length);
    state.groups.splice(index,0,saved);
    renumberLesson(u,l,sourceName);
    if(edited&&(priorUnit!==u||priorLesson!==l))renumberLesson(priorUnit,priorLesson,priorSource);
    let movedCount=0;
    if(!edited && moveSelectionAfterCreate && state.selectedForMove.size){
      const moved=state.groups.flatMap(g=>g.questions).filter(q=>state.selectedForMove.has(q.id));
      moved.forEach(q=>{
        const from=state.groups.find(g=>g.id===q.groupId);
        if(from)from.questions=from.questions.filter(item=>item.id!==q.id);
        q.groupId=saved.id;
      });
      saved.questions.push(...moved);
      movedCount=moved.length;
      state.selectedForMove.clear();
    }
    state.selectedBankId=saved.id;state.selectedQuestionId=saved.questions[0]?.id||null;
    state.filter="all";state.issueFilter="all";state.questionTypeFilter="all";
    dialog.close();
    reopenReviewAfterGroupChange(edited?"Group details updated and group order reconciled.":
      movedCount?`New group created and ${movedCount} question(s) moved.`:"New group created. Add or move questions into it.");
  };
}
function reorderGroup(id,direction){
  if(!confirmLeaveUnsavedEditor())return;
  const g=state.groups.find(x=>x.id===id);if(!g||isDiagnosticGroup(g))return;
  const peers=sameLessonGroups(g),index=peers.indexOf(g),destination=peers[index+(direction==="up"?-1:1)];
  if(!destination)return;
  const i=state.groups.indexOf(g),j=state.groups.indexOf(destination);
  [state.groups[i],state.groups[j]]=[state.groups[j],state.groups[i]];
  renumberLesson(g.unit,g.lesson,g.sourceName);state.selectedBankId=g.id;
  reopenReviewAfterGroupChange("Group order updated. The other groups in this lesson were renumbered.");
}
function deleteEmptyGroup(id){
  const group=state.groups.find(g=>g.id===id);
  if(!group || isDiagnosticGroup(group) || group.questions.length>0)return;
  if(!confirmLeaveUnsavedEditor())return;
  if(!window.confirm(`Delete empty Group ${group.number}: ${group.title}? This removes the bank from the QTI export and renumbers the other groups in its lesson.`))return;
  state.groups=state.groups.filter(g=>g.id!==id);
  renumberLesson(group.unit,group.lesson,group.sourceName);
  if(state.selectedBankId===id){
    const next=state.groups.find(g=>!isDiagnosticGroup(g));
    state.selectedBankId=next?.id||null;
    state.selectedQuestionId=next?.questions[0]?.id||null;
  }
  reopenReviewAfterGroupChange("Empty group deleted. Remaining groups have been renumbered.");
}
function openQuestionMoveDialog(){
  const moving=[...state.selectedForMove].map(id=>byId(id)).filter(Boolean);
  if(!moving.length){window.alert("Select at least one question to move.");return;}
  if(!confirmLeaveUnsavedEditor())return;
  const select=document.getElementById("moveQuestionsTarget");
  const origin=state.groups.find(g=>g.id===moving[0].groupId);
  select.innerHTML=state.groups.filter(g=>!isDiagnosticGroup(g)).map(g=>
    `<option value="${esc(g.id)}" ${g.id===origin?.id?"selected":""}>${esc(`${g.unit} – ${g.lesson} – Group ${g.number}: ${g.title}`)}</option>`).join("");
  document.getElementById("moveQuestionsCount").textContent=`Moving ${moving.length} question(s). Answers, points, internal notes, and question-level feedback are preserved. Group feedback belongs to the destination bank.`;
  const dialog=document.getElementById("moveQuestionsDialog");dialog.showModal();
  document.getElementById("moveQuestionsCancel").onclick=()=>dialog.close();
  document.getElementById("moveQuestionsCreate").onclick=()=>{dialog.close();openGroupEditor("create",null,true);};
  document.getElementById("moveQuestionsApply").onclick=()=>{
    const target=state.groups.find(g=>g.id===select.value);if(!target)return;
    const position=document.getElementById("moveQuestionsPosition").value;
    // Keep source order even for a selection spanning several banks.
    const ordered=state.groups.flatMap(g=>g.questions).filter(q=>moving.includes(q));
    for(const q of ordered){
      const from=state.groups.find(g=>g.id===q.groupId);
      from.questions=from.questions.filter(x=>x!==q);
      q.groupId=target.id;
    }
    if(position==="start")target.questions.unshift(...ordered);else target.questions.push(...ordered);
    state.selectedForMove.clear();state.selectedBankId=target.id;
    state.selectedQuestionId=ordered[0]?.id||null;
    // Preserve the question's individual feedback. Group feedback is inherited
    // from target; no old group feedback is copied into the question.
    state.filter="all";state.issueFilter="all";state.questionTypeFilter="all";
    dialog.close();
    reopenReviewAfterGroupChange(`${ordered.length} question(s) moved to ${target.title}.`);
  };
}
document.getElementById("createGroupBtn").addEventListener("click",()=>openGroupEditor("create"));
document.getElementById("moveSelectedBtn").addEventListener("click",openQuestionMoveDialog);
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
  delete copy.originBankId; // A copy is a manual addition, not a second source question.
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
  // An explicit Delete is a known author action, not a DOCX parser omission.
  const owner=state.groups.find(g=>g.id===question.originBankId);
  if(owner)owner.manuallyDeletedSourceCount=(owner.manuallyDeletedSourceCount||0)+1;
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

// VALID-071: expected versus imported question counts for the JSON report.
function bankQuestionCountReport(group){
  const configured=Number(dom.questionsPerSet.value||0)||null;
  const expected=configured ?? group.expectedQuestionCount ?? null;
  const imported=group.questions.length;
  const ownership=qtiLiveQuestionCounts(group);
  const movedOut=state.groups.flatMap(g=>g.questions).filter(q=>q.originBankId===group.id && q.groupId!==group.id).length;
  const movedIn=group.questions.filter(q=>q.originBankId && q.originBankId!==group.id).length;
  const effectiveExpected=expected==null?null:expected-movedOut+movedIn+ownership.addedHere-ownership.deletedFromSource;
  return {
    imported,
    expected,
    difference: expected==null?null:ownership.fromSource+ownership.deletedFromSource-expected,
    current_expected_after_moves:effectiveExpected,
    current_difference:effectiveExpected==null?null:imported-effectiveExpected,
    moved_out:movedOut,
    moved_in:movedIn,
    added_manually:ownership.addedHere,
    deleted_from_source:ownership.deletedFromSource,
    basis: configured?"Configured rule: Questions per group.":
      (group.expectedQuestionBasis||"No source evidence (bank created manually)."),
    source_answer_blocks: group.sourceAnswerBlockCount ?? null,
    source_numbered_choice_questions: group.independentMcQuestionCount ?? null,
    parser_numbered_openings: group.sourceNumberedQuestionCount ?? null,
    imported_from_this_source_bank: isDiagnosticGroup(group)?0:qtiLiveQuestionCounts(group).fromSource
  };
}
function reconciliationLevel(keyOf,withGroupNumbers){
  return state.groups.filter(g=>!isDiagnosticGroup(g)).reduce((out,g)=>{
    const key=keyOf(g);
    let entry=out.find(e=>e.key===key);
    if(!entry){
      entry={key,banks:0,questions:0};
      if(withGroupNumbers)entry.group_numbers=[];
      Object.assign(entry,{expected_questions:0,banks_with_expected_count:0,banks_without_expected_count:0,mismatched_banks:[]});
      out.push(entry);
    }
    const count=bankQuestionCountReport(g);
    entry.banks++;entry.questions+=g.questions.length;
    if(withGroupNumbers)entry.group_numbers.push(g.number);
    if(count.expected==null)entry.banks_without_expected_count++;
    else{
      entry.banks_with_expected_count++;entry.expected_questions+=count.expected;
      if(count.difference!==0)entry.mismatched_banks.push({
        bank:`${g.unit} – ${g.lesson} – Group ${g.number}: ${g.title}`,
        expected:count.expected,source_accounted:count.imported_from_this_source_bank+count.deleted_from_source,
        imported:count.imported,source_difference:count.difference});
    }
    return out;
  },[]);
}
function runValidation() {
  revalidateAll();
  const questions = state.groups.flatMap(group => group.questions);
  const report = {
    generated_at: new Date().toISOString(),
    totals: {
      banks: state.groups.filter(g=>!isDiagnosticGroup(g)).length,
      diagnostic_banks: state.groups.filter(isDiagnosticGroup).length,
      questions: questions.length,
      good: questions.filter(q => q.status === "good").length,
      review: questions.filter(q => q.status === "review").length,
      correction: questions.filter(q => q.status === "correction").length
    },
    settings: {
      source_point_rules: {...state.sourcePointRules},
      default_points: Number(dom.defaultPoints.value || 1),
      questions_per_set: Number(dom.questionsPerSet.value || 0) || null,
      include_heading_in_stem: dom.includeHeading.checked,
      exclude_references: dom.excludeReferences.checked,
      shuffle_answers: dom.shuffleAnswers.checked,
      output_mode: dom.outputMode.value
    },
    // VALID-071: the lesson-level entries keep their v3.16 fields and gain the
    // expected counts; unit and document levels are added alongside.
    reconciliation: reconciliationLevel(g=>`${g.sourceName} / ${g.unit} / ${g.lesson}`,true),
    reconciliation_by_unit: reconciliationLevel(g=>`${g.sourceName} / ${g.unit}`,false),
    reconciliation_by_document: reconciliationLevel(g=>g.sourceName,false),
    banks: state.groups.map(group => ({
      name: `${group.unit} – ${group.lesson} – Group ${group.number}: ${group.title}`,
      diagnostic: isDiagnosticGroup(group),
      source_name: group.sourceName,
      question_count: bankQuestionCountReport(group),
      reviewed_bank_notes: group.reviewedBankIssues || [],
      source_points_per_question: group.sourcePointsPerQuestion ?? null,
      status: group.status,
      issues: group.issues.map(issue => issue.text),
      requires_image: !!group.requiresImage || group.questions.some(q=>unresolvedQuestionImageReference(q,group)),
      image_placeholder_pending: !!group.requiresImage && !canonicalCdnImageUrl(group.imageUrl || "") && !group.questions.every(q=>hasQuestionImage(q)),
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
        unresolved_question_image: unresolvedQuestionImageReference(question,group),
        content_audit: {
          stem_html: question.stem || "",
          choices: question.type === "multiple_choice_question" || question.type === "multiple_answers_question" || question.type === "true_false_question"
            ? question.choices.map(c=>({label:c.label,html:c.html,correct:!!c.correct})) : [],
          matching_pairs: question.type === "matching_question" ? question.pairs.map(p=>({left:p.left,right:p.right})) : [],
          dropdowns: question.type === "multiple_dropdowns_question" ? question.blanks.map(b=>({
            id:b.id,prompt:b.prompt,choices:b.options.map(o=>({text:o.text,correct:!!o.correct}))
          })) : [],
          group_feedback_html: group.feedback || "",
          question_feedback_html: question.feedback || "",
          general_feedback_html: generalFeedbackHtml(question,group)
        },
        issues: question.issues.map(issue => issue.text)
      }))
    }))
  };
  state.validation = report;
  renderValidationPanel();
  if (state.activeView === "review") switchTab("validation");
  const bankCorrections=state.groups.filter(g=>g.status==="correction").length;
  const bankReviews=state.groups.filter(g=>g.status==="review").length;
  const type = report.totals.correction||bankCorrections ? "correction" : report.totals.review||bankReviews ? "review" : "good";
  setStatus(`Validation complete. ${report.totals.good} good, ${report.totals.review} review, ${report.totals.correction} correction question(s); ${bankReviews} bank(s) need review and ${bankCorrections} bank(s) need correction.`, type);
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
  // Keep the import package limited to manifest + QTI XML resources.
  // Download validation reports separately through the app's report control.
  return zip;
}

async function buildIndividualBundle() {
  const bundle = new JSZip();
  bundle.file("READ_ME_FIRST.txt", "Canvas QTI Studio v3.17 Final: This bundle is an archive of individual bank QTI ZIP files.\n" +
    "DO NOT upload this outer bundle to Canvas. Extract it, then import each inner ZIP via Settings > Import Course Content > QTI .zip file.\n" +
    "For a single QTI package upload, use the Combined QTI ZIP export mode instead.\n" +
    "Verify bank creation and question accuracy in a test Canvas course before production.\n");
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

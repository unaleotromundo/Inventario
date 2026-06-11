/**
 * Web Auditor - Main Application Controller
 */

import { auditHTML } from './modules/parser.js';
import { runDeepAIAudit } from './modules/ai.js';
import { prioritizeIssues, getImpactColor, getEffortColor } from './modules/roadmap.js';

// --- Global State ---
let currentHTML = '';
let auditResult = null;
let roadmapData = null;
let doneIssues = new Set();
let apiKey = '';

// --- DOM Elements ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const openPasteModalBtn = document.getElementById('open-paste-modal-btn');
const pasteModal = document.getElementById('paste-modal');
const closePasteModalBtn = document.getElementById('close-paste-modal-btn');
const cancelPasteBtn = document.getElementById('cancel-paste-btn');
const pasteHtmlArea = document.getElementById('paste-html-area');
const analyzePastedBtn = document.getElementById('analyze-pasted-btn');

const geminiKeyInput = document.getElementById('gemini-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const clearKeyBtn = document.getElementById('clear-key-btn');

const loadingSpinner = document.getElementById('loading-spinner');
const loadingTitle = document.getElementById('loading-title');
const loadingDesc = document.getElementById('loading-desc');

const resultsDashboard = document.getElementById('results-dashboard');
const globalScoreVal = document.getElementById('global-score-val');
const globalProgressCircle = document.getElementById('global-progress-circle');
const globalScoreBadge = document.getElementById('global-score-badge');

const seoScoreVal = document.getElementById('seo-score-val');
const seoCircle = document.getElementById('seo-circle');
const seoStatus = document.getElementById('seo-status');

const a11yScoreVal = document.getElementById('a11y-score-val');
const a11yCircle = document.getElementById('a11y-circle');
const a11yStatus = document.getElementById('a11y-status');

const perfScoreVal = document.getElementById('perf-score-val');
const perfCircle = document.getElementById('perf-circle');
const perfStatus = document.getElementById('perf-status');

const uxScoreVal = document.getElementById('ux-score-val');
const uxCircle = document.getElementById('ux-circle');
const uxStatus = document.getElementById('ux-status');

const issuesSummaryText = document.getElementById('issues-summary-text');
const exportJsonBtn = document.getElementById('export-json-btn');
const printPdfBtn = document.getElementById('print-pdf-btn');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const filterCategory = document.getElementById('filter-category');
const filterImpact = document.getElementById('filter-impact');
const issuesListContainer = document.getElementById('issues-list-container');

const listQuickWins = document.getElementById('list-quick-wins');
const listStrategic = document.getElementById('list-strategic');
const listMinorTweaks = document.getElementById('list-minor-tweaks');
const listLongTerm = document.getElementById('list-long-term');

const techRecListContainer = document.getElementById('tech-rec-list-container');

// Print View references
const printReportView = document.getElementById('print-report-view');
const printDate = document.getElementById('print-date');
const printSeoScore = document.getElementById('print-seo-score');
const printSeoStatus = document.getElementById('print-seo-status');
const printA11yScore = document.getElementById('print-a11y-score');
const printA11yStatus = document.getElementById('print-a11y-status');
const printPerfScore = document.getElementById('print-perf-score');
const printPerfStatus = document.getElementById('print-perf-status');
const printUxScore = document.getElementById('print-ux-score');
const printUxStatus = document.getElementById('print-ux-status');
const printGlobalScore = document.getElementById('print-global-score');
const printGlobalEvaluation = document.getElementById('print-global-evaluation');
const printIssuesContainer = document.getElementById('print-issues-container');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Load Gemini Key from LocalStorage
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    apiKey = savedKey;
    geminiKeyInput.value = savedKey;
    saveKeyBtn.textContent = 'Key Guardada';
    saveKeyBtn.classList.remove('btn-primary');
    saveKeyBtn.classList.add('btn-secondary');
    clearKeyBtn.style.display = 'block';
  }

  // Load done issues from LocalStorage
  const savedDone = localStorage.getItem('done_issues');
  if (savedDone) {
    try {
      doneIssues = new Set(JSON.parse(savedDone));
    } catch (e) {
      doneIssues = new Set();
    }
  }

  setupEventListeners();

  // Register Service Worker for PWA support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[Service Worker] Registrado con éxito:', reg.scope))
        .catch(err => console.error('[Service Worker] Error de registro:', err));
    });
  }
});

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Save API Key
  saveKeyBtn.addEventListener('click', () => {
    const key = geminiKeyInput.value.trim();
    if (key) {
      apiKey = key;
      localStorage.setItem('gemini_api_key', key);
      saveKeyBtn.textContent = 'Key Guardada';
      saveKeyBtn.classList.remove('btn-primary');
      saveKeyBtn.classList.add('btn-secondary');
      clearKeyBtn.style.display = 'block';
      alert('Gemini API Key guardada de forma segura en local.');
    } else {
      alert('Por favor introduce una API Key válida.');
    }
  });

  // Clear API Key
  clearKeyBtn.addEventListener('click', () => {
    apiKey = '';
    geminiKeyInput.value = '';
    localStorage.removeItem('gemini_api_key');
    saveKeyBtn.textContent = 'Guardar Key';
    saveKeyBtn.classList.add('btn-primary');
    saveKeyBtn.classList.remove('btn-secondary');
    clearKeyBtn.style.display = 'none';
  });

  // Drag and Drop Zone
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // Paste Modal Triggers
  openPasteModalBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid triggering file select
    pasteModal.style.display = 'flex';
    pasteHtmlArea.focus();
  });

  closePasteModalBtn.addEventListener('click', () => pasteModal.style.display = 'none');
  cancelPasteBtn.addEventListener('click', () => pasteModal.style.display = 'none');

  analyzePastedBtn.addEventListener('click', () => {
    const htmlText = pasteHtmlArea.value.trim();
    if (htmlText) {
      pasteModal.style.display = 'none';
      triggerAudit(htmlText);
    } else {
      alert('Por favor pega algún código HTML antes de auditar.');
    }
  });

  // Tabs navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Filters change
  filterCategory.addEventListener('change', renderIssues);
  filterImpact.addEventListener('change', renderIssues);

  // Print PDF
  printPdfBtn.addEventListener('click', () => {
    renderPrintReport();
    window.print();
  });

  // Export JSON
  exportJsonBtn.addEventListener('click', () => {
    if (!auditResult) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditResult, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `auditoria_web_report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });
}

// --- Helper: Read Uploaded File ---
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    triggerAudit(content);
  };
  reader.readAsText(file);
}

// --- Main Auditing Logic Flow ---
async function triggerAudit(htmlString) {
  currentHTML = htmlString;
  
  // 1. Show loader
  loadingSpinner.style.display = 'flex';
  resultsDashboard.style.display = 'none';
  document.querySelector('.setup-grid').style.display = 'none';

  loadingTitle.textContent = 'Analizando código HTML';
  loadingDesc.textContent = 'Ejecutando pruebas estáticas de SEO, Performance y Accesibilidad...';

  try {
    // 2. Local rule-based audit
    await delay(600); // Small delay to feel realistic and let CSS render loader
    const localResult = auditHTML(htmlString);
    auditResult = localResult;

    // 3. Optional AI deep audit
    if (apiKey) {
      loadingTitle.textContent = 'Realizando Auditoría UX con IA';
      loadingDesc.textContent = 'Conectando con Gemini API para análisis heurístico avanzado...';
      
      try {
        const aiIssues = await runDeepAIAudit(htmlString, apiKey);
        
        // Merge AI issues into our results list
        if (aiIssues && aiIssues.length > 0) {
          auditResult.issues = [...auditResult.issues, ...aiIssues];
          
          // Re-calculate UX / CRO score based on total UX issues
          const uxIssues = auditResult.issues.filter(i => i.category === 'ux');
          let uxScore = 100;
          const penaltyWeights = { high: 15, medium: 8, low: 3 };
          
          uxIssues.forEach(issue => {
            const penalty = penaltyWeights[issue.impact] || 5;
            uxScore = Math.max(0, uxScore - penalty);
          });
          
          auditResult.scores.ux = uxScore;
          
          // Re-calculate global overall score
          auditResult.overallScore = Math.round(
            (auditResult.scores.seo + 
             auditResult.scores.a11y + 
             auditResult.scores.performance + 
             auditResult.scores.ux) / 4
          );
        }
      } catch (aiError) {
        console.error('El análisis con IA falló, continuando solo con análisis local:', aiError);
        alert('El análisis heurístico avanzado de la IA no se pudo completar. Se mostrará solo el reporte de auditoría local.');
      }
    }

    // 4. Priortize and columns calculations
    const roadmap = prioritizeIssues(auditResult.issues);
    roadmapData = roadmap;

    // 5. Render
    renderDashboard();
    renderIssues();
    renderRoadmap();
    renderTechRecs();

    // 6. Show results
    loadingSpinner.style.display = 'none';
    resultsDashboard.style.display = 'block';

  } catch (error) {
    console.error('Error durante la auditoría:', error);
    alert('Ocurrió un error inesperado al analizar el HTML: ' + error.message);
    
    // Restore Setup view
    loadingSpinner.style.display = 'none';
    document.querySelector('.setup-grid').style.display = 'grid';
  }
}

// --- Render Dashboard Scores ---
function renderDashboard() {
  const scores = auditResult.scores;
  
  // Main overall score
  globalScoreVal.textContent = auditResult.overallScore;
  animateRadialCircle(globalProgressCircle, auditResult.overallScore, 80); // r=80

  // Overall evaluation label
  let badgeText = 'Requiere Acción';
  let badgeColor = 'var(--color-danger)';
  let badgeGlow = 'var(--color-danger-glow)';

  if (auditResult.overallScore >= 90) {
    badgeText = 'Excelente Estado';
    badgeColor = 'var(--color-success)';
    badgeGlow = 'var(--color-success-glow)';
  } else if (auditResult.overallScore >= 70) {
    badgeText = 'Aceptable con Mejoras';
    badgeColor = 'var(--color-info)';
    badgeGlow = 'var(--color-info-glow)';
  } else if (auditResult.overallScore >= 50) {
    badgeText = 'Mejoras Requeridas';
    badgeColor = 'var(--color-warning)';
    badgeGlow = 'var(--color-warning-glow)';
  }

  globalScoreBadge.textContent = badgeText;
  globalScoreBadge.style.backgroundColor = badgeColor;
  globalScoreBadge.style.color = '#fff';
  globalScoreBadge.style.boxShadow = `0 0 15px ${badgeGlow}`;

  // Mini gauges
  seoScoreVal.textContent = scores.seo;
  animateRadialCircle(seoCircle, scores.seo, 30); // r=30
  seoStatus.textContent = getScoreStatusLabel(scores.seo);

  a11yScoreVal.textContent = scores.a11y;
  animateRadialCircle(a11yCircle, scores.a11y, 30); // r=30
  a11yStatus.textContent = getScoreStatusLabel(scores.a11y);

  perfScoreVal.textContent = scores.performance;
  animateRadialCircle(perfCircle, scores.performance, 30); // r=30
  perfStatus.textContent = getScoreStatusLabel(scores.performance);

  uxScoreVal.textContent = scores.ux;
  animateRadialCircle(uxCircle, scores.ux, 30); // r=30
  uxStatus.textContent = getScoreStatusLabel(scores.ux);

  // Issues summary
  issuesSummaryText.textContent = `Se detectaron ${auditResult.issues.length} problemas prioritarios de SEO, Accesibilidad, Performance y UX.`;
}

// --- Render Issues Tab (Filtering & Collapsible) ---
function renderIssues() {
  const catFilter = filterCategory.value;
  const impFilter = filterImpact.value;

  issuesListContainer.innerHTML = '';

  const filtered = auditResult.issues.filter(issue => {
    const matchCat = catFilter === 'all' || issue.category === catFilter;
    const matchImp = impFilter === 'all' || issue.impact === impFilter;
    return matchCat && matchImp;
  });

  if (filtered.length === 0) {
    issuesListContainer.innerHTML = '<div class="card" style="text-align:center;color:var(--color-text-muted);">No se encontraron problemas que coincidan con los filtros aplicados.</div>';
    return;
  }

  filtered.forEach(issue => {
    const isDone = doneIssues.has(issue.id);
    const item = document.createElement('div');
    item.className = `issue-item ${isDone ? 'done-opacity' : ''}`;
    item.id = `issue-item-${issue.id}`;

    const impactBadgeColor = getImpactColor(issue.impact);
    const effortBadgeColor = getEffortColor(issue.effort);

    item.innerHTML = `
      <div class="issue-header">
        <div class="issue-title-area">
          <div class="issue-icon" style="background:${issue.category === 'seo' ? 'var(--color-primary-glow)' : issue.category === 'a11y' ? 'var(--color-info-glow)' : issue.category === 'performance' ? 'var(--color-success-glow)' : 'var(--color-warning-glow)'};">
            <span class="meta-badge ${issue.category}">${issue.category}</span>
          </div>
          <span class="issue-title">${escapeHTML(issue.title)}</span>
        </div>
        <div class="issue-meta-tags">
          <span class="meta-badge" style="background:${impactBadgeColor}20; color:${impactBadgeColor}; border: 1px solid ${impactBadgeColor}40;">Impacto: ${issue.impact}</span>
          <span class="meta-badge" style="background:${effortBadgeColor}20; color:${effortBadgeColor}; border: 1px solid ${effortBadgeColor}40;">Esfuerzo: ${issue.effort}</span>
          <svg class="issue-expand-indicator" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
      <div class="issue-body">
        <p class="issue-desc">${escapeHTML(issue.description)}</p>
        <div class="recommendation-box">
          <h5>Sugerencia Técnica</h5>
          <p>${escapeHTML(issue.recommendation)}</p>
        </div>
        ${issue.beforeCode && issue.afterCode ? renderCodeDiff(issue.beforeCode, issue.afterCode) : ''}
      </div>
    `;

    // Collapsible accordion event trigger
    item.querySelector('.issue-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });

    issuesListContainer.appendChild(item);
  });
}

// --- Render Roadmap Kanban Board ---
function renderRoadmap() {
  const columns = ['quick-wins', 'strategic', 'minor-tweaks', 'long-term'];
  const columnsContainers = {
    'quick-wins': listQuickWins,
    'strategic': listStrategic,
    'minor-tweaks': listMinorTweaks,
    'long-term': listLongTerm
  };

  // Clear columns
  columns.forEach(col => {
    columnsContainers[col].innerHTML = '';
  });

  columns.forEach(colName => {
    const list = roadmapData.columns[colName].items;
    const container = columnsContainers[colName];

    if (list.length === 0) {
      container.innerHTML = '<div class="empty-column-placeholder">Sin problemas asignados en este cuadrante.</div>';
      return;
    }

    list.forEach(issue => {
      const isDone = doneIssues.has(issue.id);
      const card = document.createElement('div');
      card.className = `roadmap-card ${isDone ? 'done' : ''}`;
      card.id = `roadmap-card-${issue.id}`;
      
      const categoryBadge = `<span class="meta-badge ${issue.category}" style="font-size:0.65rem;">${issue.category}</span>`;
      const impactColor = getImpactColor(issue.impact);

      card.innerHTML = `
        <div class="roadmap-card-header">
          ${categoryBadge}
          <div class="roadmap-card-done">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        </div>
        <h5>${escapeHTML(issue.title)}</h5>
        <div class="roadmap-card-footer">
          <span style="color:${impactColor}">Imp: ${issue.impact}</span>
          <span>Esf: ${issue.effort}</span>
        </div>
      `;

      // Event to toggle task completion state
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleIssueDone(issue.id);
      });

      container.appendChild(card);
    });
  });
}

// --- Render Technical Recommendations (Before / After Code) ---
function renderTechRecs() {
  techRecListContainer.innerHTML = '';
  
  // Filter issues that actually have code before/after samples
  const codeIssues = auditResult.issues.filter(issue => issue.beforeCode && issue.afterCode);

  if (codeIssues.length === 0) {
    techRecListContainer.innerHTML = '<div class="card" style="text-align:center;color:var(--color-text-muted);">No se requiere realizar cambios de código directos en el HTML (la mayoría son de redacción, cookies o estructura general).</div>';
    return;
  }

  codeIssues.forEach(issue => {
    const item = document.createElement('div');
    item.className = 'tech-rec-item card';
    
    item.innerHTML = `
      <h4>
        <span class="meta-badge ${issue.category}">${issue.category}</span>
        ${escapeHTML(issue.title)}
      </h4>
      <p style="color:var(--color-text-muted); margin-bottom:1rem;">${escapeHTML(issue.recommendation)}</p>
      ${renderCodeDiff(issue.beforeCode, issue.afterCode)}
    `;

    techRecListContainer.appendChild(item);
  });
}

// --- Toggle Issue Done (Roadmap Checklist Interaction) ---
function toggleIssueDone(id) {
  if (doneIssues.has(id)) {
    doneIssues.delete(id);
  } else {
    doneIssues.add(id);
  }

  // Save state
  localStorage.setItem('done_issues', JSON.stringify(Array.from(doneIssues)));

  // Update classes in roadmap cards and problem list
  const rCard = document.getElementById(`roadmap-card-${id}`);
  const iItem = document.getElementById(`issue-item-${id}`);

  if (rCard) {
    rCard.classList.toggle('done');
  }

  if (iItem) {
    iItem.classList.toggle('done-opacity');
  }
}

// --- Render Print Preview (Report) ---
function renderPrintReport() {
  const scores = auditResult.scores;
  
  // Set date
  const now = new Date();
  printDate.textContent = `Fecha de generación: ${now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} a las ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

  // Set scores
  printSeoScore.textContent = `${scores.seo}/100`;
  printSeoStatus.textContent = getScoreStatusLabel(scores.seo);
  
  printA11yScore.textContent = `${scores.a11y}/100`;
  printA11yStatus.textContent = getScoreStatusLabel(scores.a11y);

  printPerfScore.textContent = `${scores.performance}/100`;
  printPerfStatus.textContent = getScoreStatusLabel(scores.performance);

  printUxScore.textContent = `${scores.ux}/100`;
  printUxStatus.textContent = getScoreStatusLabel(scores.ux);

  printGlobalScore.textContent = `${auditResult.overallScore}/100`;
  printGlobalEvaluation.textContent = getGlobalEvaluationLabel(auditResult.overallScore);

  // Issues printable list
  printIssuesContainer.innerHTML = '';
  auditResult.issues.forEach(issue => {
    const printItem = document.createElement('div');
    printItem.className = 'print-issue-item';

    printItem.innerHTML = `
      <div class="print-issue-header">
        <span>[${issue.category.toUpperCase()}] ${escapeHTML(issue.title)}</span>
        <span>Impacto: ${issue.impact} | Esfuerzo: ${issue.effort}</span>
      </div>
      <div class="print-issue-desc">${escapeHTML(issue.description)}</div>
      <div class="print-issue-rec"><strong>Recomendación técnica:</strong> ${escapeHTML(issue.recommendation)}</div>
    `;

    printIssuesContainer.appendChild(printItem);
  });
}

// --- Animate SVG Gauge Helpers ---
function animateRadialCircle(circleEl, score, radius) {
  if (!circleEl) return;
  const circumference = 2 * Math.PI * radius;
  circleEl.style.strokeDasharray = circumference;
  
  // Calculate offset based on score
  const offset = circumference - (score / 100) * circumference;
  circleEl.style.strokeDashoffset = offset;
}

// --- Code Diff HTML Render Helper ---
function renderCodeDiff(before, after) {
  return `
    <div class="code-diff-container">
      <div class="code-editor-card">
        <div class="editor-header before">
          <span><span class="dot"></span> Código Actual</span>
          <span>HTML</span>
        </div>
        <pre><code><span class="diff-remove">${escapeHTML(before)}</span></code></pre>
      </div>
      <div class="code-editor-card">
        <div class="editor-header after">
          <span><span class="dot"></span> Propuesta Corregida</span>
          <span>HTML</span>
        </div>
        <pre><code><span class="diff-add">${escapeHTML(after)}</span></code></pre>
      </div>
    </div>
  `;
}

// --- String escaping helper to prevent rendering of actual tags in diffs ---
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Helper Delay for loader UI feels ---
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Labels based on scores ---
function getScoreStatusLabel(score) {
  if (score >= 90) return 'Excelente';
  if (score >= 70) return 'Aceptable';
  if (score >= 50) return 'Mejorable';
  return 'Crítico';
}

function getGlobalEvaluationLabel(score) {
  if (score >= 90) return 'Sitio altamente optimizado. Sigue así.';
  if (score >= 70) return 'Cumple con estándares básicos. Hay oportunidades de optimización sencillas.';
  if (score >= 50) return 'El sitio presenta problemas importantes que reducen conversiones y visibilidad.';
  return 'Estado crítico. Se requiere reestructuración técnica urgente.';
}

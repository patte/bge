// UI layer: renders the question / evaluation panels into #content, keeps the
// score gauge / answer button states in sync, wires DOM events to the engine,
// and implements the language switcher, the about modal, the bubble-preview
// PNG (download) and the share-via-URL link. Replaces the Blaze templates'
// event maps + reactive helpers.
import $ from 'jquery'
import { engine } from './engine.js'
import { Questions } from '../lib/collections.js'
import { questionHTML, evaluationHTML, aboutModalHTML, currentQuestionData } from './templates.js'
import { createSlider } from './slider.js'
import { LANGUAGES, getLanguage, setLanguage, onLanguageChange, __ } from '../lib/i18n.js'
import { buildShareUrl } from '../lib/store.js'

let contentEl = null
let lastPngDataUrl = null

function currentRawQuestion() {
  return Questions.findOne({ index: engine.getQuestionIndex() })
}

function setQuestionPadding() {
  const footerHeight = $('.footer').outerHeight()
  $('#question').css('padding-bottom', footerHeight)
}

function renderQuestionPanel() {
  if (engine.isShowEvaluation()) return
  contentEl.innerHTML = questionHTML()
  const q = currentQuestionData()
  const a = q ? engine.getAnswer(q._id) : null
  if (q) createSlider(q, a)
  setQuestionPadding()
}

function renderContent() {
  if (engine.isShowEvaluation()) {
    contentEl.innerHTML = evaluationHTML()
    renderBubblesPreview()
  } else {
    renderQuestionPanel()
  }
}

function updateProPercentUI() {
  const pp = engine.getProPercent()
  const gauge = document.getElementById('score-gauge')
  if (gauge) {
    gauge.style.bottom = pp * 0.85 + 7.5 + '%'
    const s = gauge.querySelector('span')
    if (s) s.textContent = pp + '%'
  }
  const mob = document.getElementById('mobile-score')
  if (mob) mob.textContent = pp + '% pro'
  if (engine.isShowEvaluation()) {
    const fs = contentEl.querySelector('.final-score')
    if (fs) {
      const sentencePro = pp >= 50
      fs.innerHTML = `<h2>${__('yourScore')}:</h2><span>${pp}% pro</span>${
        sentencePro ? __('sentencePro', pp) : __('sentenceAgainst', pp)
      }`
    }
  }
}

function updateAnswerStates() {
  const q = currentRawQuestion()
  if (!q) return
  const a = engine.getAnswer(q._id)
  const maxBtn = contentEl.querySelector('.max')
  const minBtn = contentEl.querySelector('.min')
  if (maxBtn) maxBtn.classList.toggle('active', !!a && a.consent === q.max)
  if (minBtn) minBtn.classList.toggle('active', !!a && a.consent === q.min)
  const fav = contentEl.querySelector('#toggle-favorite')
  // NB: coerce to a real boolean. `!!a && a.isFavorite` yields `undefined` when
  // isFavorite is unset, and classList.toggle(token, undefined) ignores the
  // force arg and *flips* the class — which made selecting an answer (which
  // emits 'answerstate') spuriously mark the question as a favorite.
  if (fav) fav.classList.toggle('active', !!(a && a.isFavorite))
  const mob = document.getElementById('mobile-score')
  if (mob) mob.textContent = engine.getProPercent() + '% pro'
}

function updateTopicStates() {
  if (!engine.isShowEvaluation()) return
  const active = engine.getActiveTopic()
  contentEl.querySelectorAll('.topic').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-topic') === active)
  })
}

// ---- bubble preview PNG (port of evaluation.rendered, minus the upload) ----
function renderBubblesPreview() {
  setTimeout(() => {
    const net = engine.getNetwork()
    if (!net) return
    const svgElement = document.querySelector('#bubblesSVG')
    if (!svgElement) return
    const svgAsXML = new XMLSerializer().serializeToString(svgElement)
    const svgSrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgAsXML)))

    const { width, height, fieldWidth } = engine.getPreviewMetrics()

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    canvas.width = fieldWidth
    canvas.height = height

    const image = new Image()
    image.width = width
    image.height = height
    image.onload = () => {
      ctx.drawImage(image, 0, 0, fieldWidth, height, 0, 0, fieldWidth, height)
      const pngData = canvas.toDataURL('image/png')
      lastPngDataUrl = pngData
      const img = document.getElementById('mybubbles-preview')
      if (img) img.setAttribute('src', pngData)
    }
    image.src = svgSrc
  }, 1000)
}

function downloadPng() {
  if (!lastPngDataUrl) return
  const a = document.createElement('a')
  a.href = lastPngDataUrl
  a.download = 'smartervote.png'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function copyShareLink() {
  const url = buildShareUrl(engine.getAnswersById())
  let ok = false
  try {
    await navigator.clipboard.writeText(url)
    ok = true
  } catch (e) {
    // fallback: put it in the hash so it's at least selectable / shareable
    try {
      history.replaceState(null, '', url)
      ok = true
    } catch (e2) {
      /* ignore */
    }
  }
  const fb = contentEl.querySelector('.share-link-feedback')
  if (fb) {
    fb.textContent = ok ? 'Link kopiert!' : url
    fb.style.display = 'block'
  }
}

// ---- about modal -----------------------------------------------------------
function renderAboutModal() {
  const modal = document.getElementById('smartervote-modal')
  if (modal) modal.innerHTML = aboutModalHTML()
}

function toggleAboutModal() {
  $('#smartervote-modal').fadeToggle(200)
}

// ---- language switcher -----------------------------------------------------
function renderLanguageSwitcher() {
  const nav = document.querySelector('#app-header .languages')
  if (!nav) return
  // join with a space: the original's Blaze {{#each}} emitted collapsed
  // whitespace *between* items in addition to the trailing &nbsp;, so the DE/FR/IT
  // row is ~8px wider than a tight join('') would render.
  nav.innerHTML = LANGUAGES.map(
    (l) => `<span class="pointer text-uppercase ${l === getLanguage() ? 'current' : ''}" data-lang="${l}" tabindex="0">${l}</span>&nbsp;`
  ).join(' ')
}

// ---- global event delegation ----------------------------------------------
function wireEvents() {
  // content panel + modal clicks (delegated on document, since content re-renders)
  document.addEventListener('click', (evt) => {
    const t = evt.target
    const closest = (sel) => t.closest && t.closest(sel)

    // about modal toggle (question header link + modal header links)
    if (closest('.toggle-about')) {
      evt.preventDefault()
      toggleAboutModal()
      return
    }

    // language switcher
    const langSpan = closest('#app-header .languages span')
    if (langSpan) {
      setLanguage(langSpan.getAttribute('data-lang'))
      return
    }

    if (engine.isShowEvaluation()) {
      if (closest('#gotoQuestions')) return engine.gotoQuestions()
      if (closest('.topic')) {
        const topic = closest('.topic').getAttribute('data-topic')
        engine.selectTopic(topic)
        // Reveal the mobile "Ansehen" toggle, exactly like the original's
        // `click .topic` handler. Its CSS keeps the button display:none until a
        // topic is picked (and display:none !important on desktop, so this is a
        // no-op there). Without it the topics panel rendered 27px shorter than
        // the original on mobile.
        $('#mobile-content-toggle-topics').slideDown(300)
        return
      }
      if (closest('.url-copy')) {
        evt.preventDefault()
        return copyShareLink()
      }
      if (closest('.img-download')) {
        evt.preventDefault()
        return downloadPng()
      }
      if (closest('#mobile-content-toggle-topics') || closest('#mobile-content-toggle-compare')) {
        $('#content').slideDown(300)
        return
      }
      return
    }

    // question panel
    const q = currentRawQuestion()
    if (closest('.max') && q) return engine.selectConsent(q.max, q)
    if (closest('.min') && q) return engine.selectConsent(q.min, q)
    if (closest('#next') && q) return engine.clickNext(q)
    if (closest('#back')) return engine.clickBack()
    if (closest('#toggle-favorite') && q) return engine.toggleFavorite(q)
    if (closest('#gotoEvaluation')) {
      evt.preventDefault()
      return engine.gotoEvaluation()
    }
    if (closest('#reset')) return engine.reset()
    if (closest('.showInfo')) {
      evt.preventDefault()
      return engine.setShowInfo(true)
    }
    if (closest('.hideInfo a')) {
      evt.preventDefault()
      return engine.setShowInfo(false)
    }
  })

  // mobile content toggle (the top-left eye)
  const mct = document.getElementById('mobile-content-toggle')
  if (mct) {
    mct.addEventListener('click', () => {
      $('#content').fadeToggle(200)
      $('#bubbles-container').toggleClass('dim')
    })
  }

  // belt-and-suspenders: clear drag-dim on any pointer release
  const clearDim = () => $('#content, #bubbles-container').removeClass('dim')
  document.addEventListener('mouseup', clearDim)
  document.addEventListener('pointerup', clearDim)
  document.addEventListener('touchend', clearDim)

  // engine -> UI
  engine.on('question', renderQuestionPanel)
  engine.on('info', renderQuestionPanel)
  engine.on('view', renderContent)
  engine.on('propercent', updateProPercentUI)
  engine.on('answerstate', updateAnswerStates)
  engine.on('topic', updateTopicStates)

  // language changes: re-render visible content, modal & switcher
  onLanguageChange(() => {
    renderContent()
    renderAboutModal()
    renderLanguageSwitcher()
  })
}

export function initUI() {
  contentEl = document.getElementById('content')
  renderLanguageSwitcher()
  renderAboutModal()
  wireEvents()
  // initial paint (engine.start will emit events that trigger renders too,
  // but paint once up-front so there is never an empty panel)
  renderContent()
  updateProPercentUI()
}

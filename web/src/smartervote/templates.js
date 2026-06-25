// HTML for the question / evaluation / about panels. These reproduce the
// original Blaze templates (smartervote.html) as plain template strings,
// driven by the same data the original helpers used.
import { marked } from 'marked'
import { Questions } from '../lib/collections.js'
import { __, getLanguage } from '../lib/i18n.js'
import { engine } from './engine.js'

marked.setOptions({ breaks: false, gfm: true })

// The original app's Meteor markdown package gave every heading a GitHub-style
// slug id, which is what the about-modal nav anchors (#about, #impressum,
// #daten-und-technisches) scroll to. Modern marked dropped auto-ids, so the
// anchors resolved to nothing and clicking them did not scroll. Restore the
// same slugging (lowercase, non-word runs -> '-') so the anchors work again.
const headingSlug = (text) => text.toLowerCase().replace(/[^\w]+/g, '-')
marked.use({
  renderer: {
    heading(text, level) {
      return `<h${level} id="${headingSlug(text)}">${text}</h${level}>\n`
    },
  },
})

const QUESTION_LABEL_LENGTH_MAX = 5

// Resolve the current question with the active language's label/info, exactly
// like the original `question` helper.
export function currentQuestionData() {
  const lang = getLanguage()
  const q = Questions.findOne({ index: engine.getQuestionIndex() })
  if (q == null) return null
  const data = Object.assign({}, q)
  if (q.languages[lang]) {
    data.label = q.languages[lang].label
    data.minLabel = q.languages[lang].minLabel
    data.maxLabel = q.languages[lang].maxLabel
    data.info = q.languages[lang].info
  }
  return data
}

function splitLabel(text, affix) {
  if (text == null) return ''
  if (text.indexOf(',') === -1 && text.length > QUESTION_LABEL_LENGTH_MAX) {
    return affix ? text : ''
  }
  const parts = text.split(',')
  return (affix ? parts[1] : parts[0]) || ''
}

function favoriteActiveClass(q) {
  const a = engine.getAnswer(q._id)
  return a && a.isFavorite ? 'active' : ''
}

function answerButtonActiveClass(q, isMax) {
  const a = engine.getAnswer(q._id)
  if (!a) return ''
  if (isMax && a.consent === q.max) return 'active'
  if (!isMax && a.consent === q.min) return 'active'
  return ''
}

function infoSection(q) {
  if (!q.info) return ''
  if (engine.isShowInfo()) {
    return `<div class="info"><div class="hideInfo">${marked.parse(q.info)}<br><a href="#">${__('lessInformation')}</a></div></div>`
  }
  return `<div class="info"><a href="#" class="showInfo">${__('moreInformation')} <b class="caret"></b></a></div>`
}

export function questionHTML() {
  const q = currentQuestionData()
  if (q == null) return '<div id="question"></div>'
  const proPercent = engine.getProPercent()
  return `<div id="question">
    <div id="header">
      <span class="sr-only">${__('question')} </span><span id="question-index">${q.index + 1}</span>
      <button type="button" id="toggle-favorite" class="btn ${favoriteActiveClass(q)}"><span class="sr-only">${__('favorite')}</span></button>
      <a id="show-all-questions" class="toggle-about" href="#alle-fragen-und-infos">About</a>
      <span id="mobile-score">${proPercent}% pro</span>
      <br>
      <label for="${q._id}" class="the-question control-label">${q.label || ''}</label>
      ${infoSection(q)}
    </div>

    <div class="footer">
      <div class="answers control-section">
        <button type="button" class="max ${answerButtonActiveClass(q, true)} btn btn-default">
          <span>${splitLabel(q.maxLabel, false)}</span>
          ${splitLabel(q.maxLabel, true)}
        </button>
        <br>
        <button type="button" class="min ${answerButtonActiveClass(q, false)} btn btn-default">
          <span>${splitLabel(q.minLabel, false)}</span>
          ${splitLabel(q.minLabel, true)}
        </button>
      </div>
      ${sliderHTML()}
      <div id="question-navigation" class="control-section">
        <button type="button" id="back" class="btn btn-default"><span>${__('back')}</span></button>
        <button type="button" id="gotoEvaluation" class="btn btn-default">${__('evaluation')}</button>
        <button type="button" id="next" class="btn btn-default"><span>${__('next')}</span></button>
      </div>
      <button type="button" id="reset" class="btn btn-danger">${__('deleteAllAnswers')}</button>
    </div>
  </div>`
}

export function sliderHTML() {
  return `<div class="at-nouislider control-section">
    <div class="nouislider-container">
      <span class="nouislider-label">${__('totalyIrrelevant')}</span>
      <div id="nouislider" class="nouislider"></div>
      <span class="nouislider-label">${__('veryImportant')}</span>
    </div>
  </div>`
}

const ICON_LINK =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>'
const ICON_DOWNLOAD =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'

export function evaluationHTML() {
  const proPercent = engine.getProPercent()
  const sentencePro = proPercent >= 50
  const sentence = sentencePro ? __('sentencePro', proPercent) : __('sentenceAgainst', proPercent)

  const topics = engine
    .getTopics()
    .map((topic) => {
      const pp = engine.getProPercentForTopic(topic)
      const active = topic === engine.getActiveTopic() ? 'active' : ''
      return `<button type="button" class="topic ${active} btn btn-default" data-topic="${topic}">
        <strong>${__(topic)}</strong> (${pp} %)
      </button>`
    })
    .join('')

  return `<div id="evaluation">
    <div id="question-navigation" class="control-section">
      <button type="button" id="gotoQuestions" class="btn btn-default">${__('gotoQuestions')}</button>
    </div>

    <div class="final-score">
      <h2>${__('yourScore')}:</h2>
      <span>${proPercent}% pro</span>
      ${sentence}
    </div>

    <div class="sharing">
      <h2>${__('shareYourScore')}:</h2>
      <div class="preview-wrapper">
        <div class="share-buttons-wrapper">
          <a class="url-copy" href="#" title="Link kopieren">${ICON_LINK}</a>
          <p class="share-link-feedback" style="display:none;"></p>
          <a class="img-download" href="#" title="Bild herunterladen">${ICON_DOWNLOAD}</a>
        </div>
        <img id="mybubbles-preview" title="Rechts klicken, um das Bild herunterzuladen">
      </div>
    </div>

    <div class="topics">
      <h2>${__('whereDoYouStand')}</h2>
      ${topics}
      <button type="button" id="mobile-content-toggle-topics" class="mobile-content-toggle"><span class="icon-eye"></span> Ansehen</button>
    </div>
  </div>`
}

// The "about" modal content: static German about/impressum (verbatim from the
// original) plus the language-dependent questions overview.
const ABOUT_MARKDOWN = `# About

__Dies ist das Archiv der Website bedingungslos.ch, welche im Frühjahr 2016 zur Volksinitiative «Für ein bedingungsloses Grundeinkommen» lanciert wurde.__

Finde heraus, wie Du zum bedingungslosen Grundeinkommen stehst!

Beantworte die Fragen zu den möglichen Auswirkungen des Grundeinkommens. Dadurch baust du dein persönliches Bild zu dieser Idee für unsere Gesellschaft. Smartervote ist keine Propaganda, sondern der Versuch, die Chancen und Gefahren des Grundeinkommens aufzuzeigen – damit du deine eigene Meinung (ab)bilden kannst.

Danach kannst du dein Bild ~~über Facebook, Twitter oder~~ per Mail mit Freunden teilen und deine Ergebnisse vergleichen.

# Impressum

Idee und Konzept: Patrick Recher, Clara Vuillemin – [bge@patpat.org](mailto:bge@patpat.org) (PGP ID: [458c7704](https://mail-api.proton.me/pks/lookup?op=get&search=bge@patpat.org) Proton)

Inhaltliche Umsetzung und Projektleitung: Clara Vuillemin

Technische Umsetzung: Patrick Recher

Gestaltung: By Heart, Paolo De Caro

Interaktionsdesign und Umsetzung: Tobias Vogler – [tobi@tvdesign.ch](mailto:tobi@tvdesign.ch)

Produktion: Daniel Straub, Christian Müller – [info@bedingungslos.ch](mailto:info@bedingungslos.ch)


# Daten und Technisches



~~Wir speichern sämtliche Antworten und Daten zu den Benutzerinteraktionen auf der Website. Zur Analyse des Surf-Verhaltens verwenden wir kein Google Analytics sondern die open-source Lösung [PIWIK](http://piwik.org/).~~ In diesem Archiv werden keine Antworten oder Daten serverseitig gespeichert: Deine Antworten bleiben in deinem Browser (localStorage) und werden, wenn du dein Bild teilst, in den Link kodiert – kein Server, keine Datenbank, kein Tracking.

Personenbezogene Daten (IP-Adresse, E-mail etc.) werden nicht an Dritte weitergegeben.


Wir sind kein böser Datenpolyp und betrachten Daten nicht als Eigentum. ~~Wenn du interessiert bist an den anonymisierten Daten, schreib uns an: [bge@patpat.org](mailto:bge@patpat.org)~~ In diesem Archiv werden keine Daten mehr erhoben.

Der ganze Quellcode ist auf [Github](https://github.com/patte/bge/) verfügbar und steht unter der GNU General Public License.

Im Juni 2026 wurde die ursprüngliche Website mit Hilfe von LLMs «vibe-portiert»: Nur noch das Spiel selbst wurde in eine statische Version überführt. Das macht den Betrieb günstiger und datensparsamer, weil weder Server noch Datenbank nötig sind — und somit auch keine Daten mehr gesammelt werden.

~~Wir sind auf gemieteten Servern von [Exoscale](https://www.exoscale.ch/) in der Schweiz, gehostet.~~ Dieses Archiv der Website ist ~~auf fly.io gehostet~~ als statische Seite auf [Cloudflare Pages](https://pages.cloudflare.com/) gehostet.`

export function aboutModalHTML() {
  const lang = getLanguage()
  const questions = Questions.find({}, { sort: { index: 1 } })
    .fetch()
    .map((q) => {
      const l = q.languages[lang] || q.languages.de
      const info = l.info ? marked.parse(l.info) : ''
      return `<h2>${q.index + 1}. ${l.label || ''}</h2><p>${info}</p>`
    })
    .join('\n')

  return `<div class="smartervote-modal-header clearfix">
      <a href="#" class="toggle-about pull-right">Schliessen</a>
      <a href="#about" class="pull-left">About</a>
      <a href="#impressum" class="pull-left">Impressum</a>
      <a href="#daten-und-technisches" class="pull-left">Daten und Technisches</a>
      <a href="#alle-fragen-und-infos" class="pull-left">Alle Fragen und Infos</a>
    </div>
    ${marked.parse(ABOUT_MARKDOWN)}
    <h1>${__('questionOverview')}</h1>
    ${questions}
    <p><a href="#" class="toggle-about">Schliessen</a></p>`
}

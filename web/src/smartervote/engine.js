// Port of the game logic from app/client/views/smartervote/smartervote.coffee.
// The bubble state machine (Chain / Pitcher / Field), the answer model and the
// proPercent computation are kept faithful to the original. Meteor specifics
// (Session / ReactiveVar / Tracker / Meteor.call / Piwik / tutorial) are
// replaced by a tiny event bus + localStorage persistence.
import $ from 'jquery'
import { Network } from '../lib/network.js'

// d3 v3 is provided as a global by the classic <script> in index.html.
const d3 = window.d3
import { Questions, NUM_QUESTIONS } from '../lib/collections.js'
import { persistAnswers, loadStoredAnswers, clearStoredAnswers } from '../lib/store.js'

// ---- tiny event bus (replaces Blaze reactivity) ---------------------------
const bus = {
  map: {},
  on(ev, fn) {
    ;(this.map[ev] || (this.map[ev] = [])).push(fn)
    return () => {
      this.map[ev] = (this.map[ev] || []).filter((f) => f !== fn)
    }
  },
  emit(ev, ...args) {
    ;(this.map[ev] || []).forEach((fn) => fn(...args))
  },
}

const _colors = [
  ['00f384', '2ff56b'],
  ['34f569', '6af84d'],
  ['6ff84b', '9bfa34'],
  ['a0fb31', 'c1fc20'],
  ['c6fc1d', 'dffd11'],
  ['e1fe10', 'f3fe06'],
  ['feff01', 'fff708'],
  ['fff30c', 'ffd827'],
  ['ffd52a', 'ffb748'],
  ['ffb44b', 'ff9669'],
  ['ff936c', 'ff748b'],
  ['ff718e', 'ff52ad'],
  ['ff4db2', 'ff2fd0'],
  ['ff2ad5', 'ff0bf4'],
  ['ff08f7', 'e725ff'],
  ['e32aff', 'c558ff'],
  ['c25cff', 'a784ff'],
  ['a489ff', '8dabff'],
  ['8bafff', '77cdff'],
  ['76cfff', '66e7ff'],
  ['64eaff', '5af9ff'],
  ['59fbff', '56ffff'],
]

let _radiusMax = null
let _radiusChain = null
let _radiusScale = null
let _linkDistanceMax = null
let _linkDistanceScale = null

let _clusters = []
let _topics = []

let _network = null
let _beforeHoverIndex = null
let _beforeHoverShowEvaluation = null

let _chain = null
let _pitcher = null
let _field = null

let _answers = {}
let _answerSaver = null
let _proPercent = 0
let _clustersAdded = false

let _numQuestions = 0

let _questionIndex = -1
let _showInfo = false
let _showEvaluation = false
let _activeTopic = null
let _previousSelectedId = null

const _breakpointX = 768

let _questionIndices = [] // back-navigation history (was Session_ 'questionIndices')
let _sharedMode = false // viewing a shared result -> don't persist
let _resetting = false // tearing down for a reset reload -> don't persist

let _previousRadiusMax = null
let _previousLinkDistanceMax = null
let _resizeTimeout = null

// ---- reactive-ish setters --------------------------------------------------
function setQuestionIndex(i) {
  _questionIndex = i
  maintainSelectedNode()
  bus.emit('question')
}
function setShowInfo(b) {
  _showInfo = b
  bus.emit('info')
}
function setProPercent(v) {
  _proPercent = v
  bus.emit('propercent')
}
function setShowEvaluation(b) {
  _showEvaluation = b
  bus.emit('view')
}
function setActiveTopic(t) {
  _activeTopic = t
}
function bumpAnswerTrigger() {
  bus.emit('answerstate')
}

// ---- Answer.getProPercent (from collections/answers.coffee) ----------------
function getProPercent(answers) {
  let total = 0
  let pro = 0
  answers.forEach((answer) => {
    if (answer.status === 'valid') {
      const a = 2 * Math.PI * Math.pow(answer.radius, 2)
      total += a
      if (answer.value > 0) pro += a
    }
  })
  let proPercent = (100 * pro) / total
  if (total === 0) proPercent = 50
  proPercent = Math.round(proPercent)
  return proPercent
}

// ---- geometry helpers (verbatim) ------------------------------------------
function getBubblesWidth() {
  const wWidth = $(window).width()
  let w = $('#content').offset().left
  if (wWidth < _breakpointX) w = wWidth
  return w
}

function resize() {
  if (_resizeTimeout != null) clearTimeout(_resizeTimeout)
  _resizeTimeout = setTimeout(doResize, 100)
}

function doResize() {
  if (_network == null) return
  _network.resize()
  upsertClusters()

  const footer = $('.footer')
  if (footer != null && footer.length > 0) {
    _network.changeNode({
      id: 'pitcher',
      px: footer.offset().left + footer.width() / 2,
      py: footer.offset().top - 50,
    })
  }

  const bc = $('#bubbles-container')
  const bcw = bc.width()
  const bch = bc.height()
  _network.changeNode({ id: 'chain_top', px: bcw - _radiusChain, py: 0 })
  _network.changeNode({ id: 'chain_bottom', px: bcw - _radiusChain, py: bch })
  _chain.items.forEach((item) => {
    _network.changeNode({ id: item.question._id, x: bcw - _radiusChain })
  })

  _field.setXMax(getBubblesWidth())

  const footerHeight = $('.footer').outerHeight()
  $('#question').css('padding-bottom', footerHeight)

  refreshRadius()
  refreshLinkDistances()
}

function upsertClusters() {
  const numClusters = _clusters.length
  const bubblesWidth = getBubblesWidth()
  const width = (bubblesWidth * 3) / 5
  const height = $(window).height()
  let i = 0
  _clusters.forEach((c) => {
    const x = bubblesWidth / 5 + Math.round((width / numClusters) * i)
    i += 1
    if (!_clustersAdded) {
      _network.addNode({ id: c + '_max', fixed: true, x: x, y: 0, radius: 0 })
      _network.addNode({ id: c + '_min', fixed: true, x: x, y: height, radius: 0 })
    } else {
      _network.changeNode({ id: c + '_max', px: x })
      _network.changeNode({ id: c + '_min', px: x, py: height })
    }
  })
  _clustersAdded = true
}

function refreshRadius() {
  const onDesktop = $(window).width() >= _breakpointX
  if (onDesktop) {
    _radiusMax = 80
    _radiusChain = 12
    _radiusScale = d3.scale.linear()
    _radiusScale.domain([0, 0.5])
    _radiusScale.range([20, _radiusMax])
  } else {
    _radiusMax = 40
    _radiusChain = 10
    _radiusScale = d3.scale.linear()
    _radiusScale.domain([0, 0.5])
    _radiusScale.range([15, _radiusMax])
  }
  if (_previousRadiusMax != null && _previousRadiusMax !== _radiusMax) {
    const a = _pitcher.holdingAnswer
    if (a != null) {
      _network.changeNode({ id: a.question._id, radius: _radiusScale(Math.abs(a.value || 0.25)) })
    }
    _chain.items.forEach((answer) => {
      if (answer.status === 'skipped') {
        _network.changeNode({ id: answer.question._id, radius: _radiusChain - 2.5 })
      } else {
        _network.changeNode({ id: answer.question._id, radius: _radiusChain })
      }
    })
    _field.nodeIds.forEach((id) => {
      const answer = _answers[id]
      if (answer.value == null) return
      answer.radius = _radiusScale(Math.abs(answer.value))
      _field.update(answer)
    })
    _network.setRadiusMax(_radiusMax)
  }
  _previousRadiusMax = _radiusMax
}

function refreshLinkDistances() {
  _linkDistanceMax = $(window).height()
  _linkDistanceScale = d3.scale.linear()
  _linkDistanceScale.domain([-0.5, 0.5])
  _linkDistanceScale.range([0, _linkDistanceMax])
  if (_previousLinkDistanceMax != null && _previousLinkDistanceMax !== _linkDistanceMax) {
    _field.nodeIds.forEach((id) => {
      const answer = _answers[id]
      _field.update(answer)
    })
  }
  _previousLinkDistanceMax = _linkDistanceMax
}

function updateProPercent() {
  let answers = Object.keys(_answers).map((key) => _answers[key])
  const activeTopic = _activeTopic
  if (activeTopic != null) {
    answers = answers.filter((a) => a.question.topic === activeTopic)
  }
  setProPercent(getProPercent(answers))
}

function maintainSelectedNode() {
  if (_network == null) return
  if (_previousSelectedId != null) {
    _network.changeNode({ id: _previousSelectedId, removeClasses: true })
    _previousSelectedId = null
  }
  const index = _questionIndex
  const question = Questions.findOne({ index: index })
  if (question == null) return
  _network.changeNode({ id: question._id, classes: 'selected' })
  _previousSelectedId = question._id
}

// ---- navigation (verbatim) -------------------------------------------------
function gotoQuestionIndex(newIndex) {
  let answer = _pitcher.getAnswer()
  if (answer != null && answer.position === 'pitcher') {
    updateAnswer(null, null, answer.question)
    _chain.catch(answer)
    _pitcher.free()
    answer.position = 'chain'
    _answers[answer.question._id] = answer
  }
  const question = Questions.findOne({ index: newIndex })
  answer = _answers[question._id]
  if (answer.position === 'chain') {
    _chain.free(answer)
    _pitcher.catch(answer)
    answer.position = 'pitcher'
    _answers[question._id] = answer
  }
  setQuestionIndex(newIndex)
  _questionIndices.push(newIndex)
}

function next(question) {
  const answer = _answers[question._id]
  updateAnswer(null, null, question)
  if (answer.position === 'pitcher') {
    _chain.catch(answer)
    _pitcher.free()
    answer.position = 'chain'
    _answers[question._id] = answer
  }
  goNext()
}

function goNext() {
  const nextItem = _chain.shift()
  if (nextItem != null) {
    const question = nextItem.question
    const answer = _answers[question._id]
    answer.position = 'pitcher'
    _answers[question._id] = answer
    _pitcher.catch(answer)
    setQuestionIndex(question.index)
    _questionIndices.push(question.index)
  } else {
    if (_questionIndex === -1) {
      setQuestionIndex(1)
    }
    setShowEvaluation(true)
  }
}

function updateAnswer(consent, importance, question) {
  const answer = _answers[question._id]

  let newConsent = consent
  if (newConsent == null) newConsent = answer.consent
  if (newConsent == null) newConsent = null
  let newImportance = importance
  if (newImportance == null) newImportance = answer.importance
  if (newImportance == null) newImportance = null

  let newValue
  if (newConsent === null && newImportance === null) {
    newValue = 0.25
  } else if (newConsent === null && newImportance !== null) {
    newValue = newImportance * 0.5
  } else if (newConsent !== null && newImportance === null) {
    newImportance = 0.5
  }
  if (newConsent !== null && newImportance !== null) {
    newValue = newConsent * newImportance
  }

  const newRadius = _radiusScale(Math.abs(newValue))

  let newStatus = 'valid'
  if (newImportance === 0 || (question.isOneSided && newConsent === 0)) {
    newStatus = 'dead'
  } else if (newConsent === null) {
    newStatus = 'skipped'
  }

  if (newStatus === 'dead' && newConsent === 0) {
    $('.nouislider').attr('disabled', true)
  } else {
    $('.nouislider').attr('disabled', false)
  }

  const newAnswer = Object.assign({}, answer, {
    consent: newConsent,
    importance: newImportance,
    value: newValue,
    radius: newRadius,
    status: newStatus,
  })

  if (importance !== null && consent === null) {
    // updated importance
    if (answer.position === 'pitcher') {
      if (newAnswer.status === 'valid' || newAnswer.status === 'skipped') {
        _pitcher.update(newAnswer)
      } else if (newAnswer.status === 'dead') {
        newAnswer.position = 'field'
        _field.catch(newAnswer)
        _pitcher.free()
      }
    } else if (answer.position === 'field') {
      if (newAnswer.status === 'skipped') {
        newAnswer.position = 'pitcher'
        _pitcher.catch(newAnswer)
        _field.free(newAnswer)
      } else {
        _field.update(newAnswer)
      }
    }
  }

  if (consent !== null && importance === null) {
    // updated consent
    if (answer.position === 'pitcher') {
      newAnswer.position = 'field'
      _field.catch(newAnswer)
      _pitcher.free()
    } else if (answer.position === 'field') {
      _field.update(newAnswer)
    }
  }

  if (consent === -1 && importance === -1) {
    // next / back
    if (answer.position === 'pitcher') {
      newAnswer.position = 'chain'
      _chain.catch(newAnswer)
      _pitcher.free()
    }
  }

  _answers[question._id] = newAnswer

  updateProPercent()

  if (newAnswer.status !== 'skipped') {
    _answerSaver.upsertAnswer(question._id)
  }
}

// ---- persistence (replaces Meteor.call 'upsertAnswer') ---------------------
class AnswerSaver {
  constructor() {
    this.saveTimeout = null
  }
  upsertAnswer() {
    if (_sharedMode || _resetting) return
    if (this.saveTimeout != null) clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => persistAnswers(_answers), 1000)
  }
  flush() {
    if (_sharedMode || _resetting) return
    if (this.saveTimeout != null) clearTimeout(this.saveTimeout)
    persistAnswers(_answers)
  }
}

// ---- Pitcher / Field / Chain (verbatim ports) -----------------------------
class Pitcher {
  constructor(ourNetwork) {
    this.network = ourNetwork
    this.holdingAnswer = null
    this.network.addNode({ id: 'pitcher', fixed: true, x: 800, y: 400, radius: 0 })
  }
  catch(answer) {
    this.holdingAnswer = answer
    this.update(answer)
    this.network.addLink({ sourceId: 'pitcher', targetId: answer.question._id, linkDistance: 1 })
  }
  update(answer) {
    if (answer.question._id !== this.holdingAnswer.question._id) throw new Error('answer is not on pitcher')
    this.network.changeNode({
      id: this.holdingAnswer.question._id,
      radius: answer.radius,
      fillColor: 'url(#color_' + answer.question.index + ')',
      strokeWidth: 0,
      isFavorite: answer.isFavorite,
      isDead: answer.status === 'dead',
    })
  }
  free() {
    this.network.removeLink({ sourceId: 'pitcher', targetId: this.holdingAnswer.question._id })
    this.holdingAnswer = null
  }
  getAnswer() {
    return this.holdingAnswer
  }
}

class Field {
  constructor(ourNetwork) {
    this.network = ourNetwork
    this.nodeIds = []
    this.xMax = null
  }
  buildAndCatch(answer) {
    const question = answer.question
    const node = {
      id: question._id,
      qIndex: question.index,
      x: this.network.width,
      y: this.network.height / 2,
      radius: answer.radius,
      fillColor: 'url(#color_' + answer.question.index + ')',
    }
    this.network.addNode(node)
    this.catch(answer)
  }
  catch(answer) {
    const ldMin = _linkDistanceScale(answer.value)
    const question = answer.question
    this.network.changeNode({
      id: question._id,
      radius: answer.radius,
      fillColor: 'url(#color_' + answer.question.index + ')',
      strokeWidth: 0,
      xMax: this.xMax != null ? this.xMax : undefined,
      xMaxT: Date.now() + 3000,
      isFavorite: answer.isFavorite,
      isDead: answer.status === 'dead',
    })
    this.network.addLink({ sourceId: question._id, targetId: question.cluster + '_min', linkDistance: ldMin })
    this.network.addLink({
      sourceId: question._id,
      targetId: question.cluster + '_max',
      linkDistance: _linkDistanceMax - ldMin,
    })
    this.nodeIds.push(question._id)
  }
  update(answer) {
    const question = answer.question
    this.network.changeNode({
      id: question._id,
      radius: answer.radius,
      fillColor: 'url(#color_' + answer.question.index + ')',
      strokeWidth: 0,
      xMax: this.xMax != null ? this.xMax : undefined,
      isFavorite: answer.isFavorite,
      isDead: answer.status === 'dead',
    })
    const ldMin = _linkDistanceScale(answer.value)
    this.network.changeLink({ sourceId: question._id, targetId: question.cluster + '_min', linkDistance: ldMin })
    this.network.changeLink({
      sourceId: question._id,
      targetId: question.cluster + '_max',
      linkDistance: _linkDistanceMax - ldMin,
    })
  }
  free(answer) {
    const question = answer.question
    this.network.removeLink({ sourceId: question._id, targetId: question.cluster + '_min' })
    this.network.removeLink({ sourceId: question._id, targetId: question.cluster + '_max' })
    this.network.changeNode({ id: question._id, removeXMax: true })
    const index = this.nodeIds.indexOf(question._id)
    this.nodeIds.splice(index, 1)
  }
  setXMax(max) {
    this.xMax = max
    this.nodeIds.forEach((id) => {
      this.network.changeNode({ id: id, xMax: max })
    })
  }
}

class Chain {
  constructor(ourNetwork) {
    this.linkDistance = 1
    this.strokeWidth = 0.3
    this.strokeColor = '#000'
    this.network = ourNetwork
    this.items = []
    this.nodeIds = []
    this.network.addNode({ id: 'chain_top', fixed: true, x: this.network.width - _radiusChain, y: 0, radius: 0 })
    this.network.addNode({
      id: 'chain_bottom',
      fixed: true,
      x: this.network.width - _radiusChain,
      y: this.network.height,
      radius: 0,
    })
  }
  buildAndCatch(answer) {
    const node = {
      id: answer.question._id,
      qIndex: answer.question.index,
      x: this.network.width - _radiusChain / 2,
      y: _radiusChain * 3 * this.nodeIds.length,
    }
    this.network.addNode(node)
    this.catch(answer)
  }
  catch(answer) {
    if (answer.status === 'new') {
      this.network.changeNode({
        id: answer.question._id,
        radius: _radiusChain,
        fillColor: 'url(#color_' + answer.question.index + ')',
        strokeWidth: 0,
        isFavorite: false,
        isDead: false,
      })
    } else if (answer.status === 'skipped') {
      this.network.changeNode({
        id: answer.question._id,
        radius: _radiusChain - 2.5,
        fillColor: '#fff',
        strokeColor: 'url(#color_' + answer.question.index + ')',
        strokeWidth: 5,
        isFavorite: false,
        isDead: false,
      })
    }

    if (this.nodeIds.length === 0) {
      this.network.addLink({ sourceId: answer.question._id, targetId: 'chain_top', linkDistance: this.linkDistance })
    } else {
      this.network.addLink({
        sourceId: answer.question._id,
        targetId: this.nodeIds[this.nodeIds.length - 1],
        linkDistance: this.linkDistance,
        strokeWidth: this.strokeWidth,
        strokeColor: this.strokeColor,
      })
    }
    this.nodeIds.push(answer.question._id)
    this.items.push(answer)

    if (this.nodeIds.length > 1) {
      this.network.removeLink({ sourceId: 'chain_bottom', targetId: this.nodeIds[this.nodeIds.length - 2] })
    }
    this.network.addLink({
      sourceId: 'chain_bottom',
      targetId: this.nodeIds[this.nodeIds.length - 1],
      linkDistance: this.linkDistance,
    })
  }
  shift() {
    const nodeId = this.nodeIds.shift()
    if (nodeId != null) {
      if (this.nodeIds.length > 0) {
        this.network.addLink({ sourceId: this.nodeIds[0], targetId: 'chain_top', linkDistance: this.linkDistance })
        this.network.removeLink({ sourceId: this.nodeIds[0], targetId: nodeId })
      }
      this.network.removeLink({ sourceId: nodeId, targetId: 'chain_top' })
      if (this.nodeIds.length === 0) {
        this.network.removeLink({ sourceId: 'chain_bottom', targetId: nodeId })
      }
    }
    return this.items.shift()
  }
  pop() {
    const nodeId = this.nodeIds.pop()
    if (nodeId != null) {
      const lastIndex = this.nodeIds.length - 1
      if (this.nodeIds.length > 0) {
        this.network.addLink({
          sourceId: 'chain_bottom',
          targetId: this.nodeIds[lastIndex],
          linkDistance: this.linkDistance,
        })
        this.network.removeLink({ sourceId: nodeId, targetId: this.nodeIds[lastIndex] })
      }
      this.network.removeLink({ sourceId: 'chain_bottom', targetId: nodeId })
      if (this.nodeIds.length === 0) {
        this.network.removeLink({ sourceId: nodeId, targetId: 'chain_top' })
      }
    }
    return this.items.pop()
  }
  free(answer) {
    const nodeId = answer.question._id
    const index = this.nodeIds.indexOf(nodeId)
    if (index === 0) {
      return this.shift()
    } else if (index === this.nodeIds.length - 1) {
      return this.pop()
    } else {
      this.network.addLink({
        sourceId: this.nodeIds[index + 1],
        targetId: this.nodeIds[index - 1],
        linkDistance: this.linkDistance,
        strokeWidth: this.strokeWidth,
        strokeColor: this.strokeColor,
      })
      this.network.removeLink({ sourceId: nodeId, targetId: this.nodeIds[index - 1] })
      this.network.removeLink({ sourceId: this.nodeIds[index + 1], targetId: nodeId })
      this.nodeIds.splice(index, 1)
      return this.items.splice(index, 1)
    }
  }
}

// ---- public actions (invoked from the UI) ---------------------------------
function selectConsent(consentValue, question) {
  updateAnswer(consentValue, null, question)
  bumpAnswerTrigger()
}

function setImportance(importance, question) {
  updateAnswer(null, importance, question)
  bumpAnswerTrigger()
}

function clickNext(question) {
  setShowInfo(false)
  next(question)
}

function clickBack() {
  setShowInfo(false)
  let qi = _questionIndices.pop()
  if (qi === _questionIndex) qi = _questionIndices.pop()
  if (qi == null) qi = _questionIndex - 1
  if (qi < 0) qi = _numQuestions - 1
  gotoQuestionIndex(qi)
}

function toggleFavorite(question) {
  const answer = _answers[question._id]
  if (answer.isFavorite != null) {
    answer.isFavorite = !answer.isFavorite
  } else {
    answer.isFavorite = true
  }
  bumpAnswerTrigger()
  _network.changeNode({
    id: question._id,
    isFavorite: answer.isFavorite,
    isDead: answer.status !== 'valid',
  })
  _answerSaver.upsertAnswer(question._id)
}

function gotoEvaluation() {
  setShowEvaluation(true)
}
function gotoQuestions() {
  setShowEvaluation(false)
}

function reset() {
  // resetVisit: clear all answers and reload (matches old window.location.reload).
  // Guard against the pagehide/visibilitychange flush that fires *during* the
  // reload: without it that flush re-persists the still-full in-memory _answers
  // over the cleared store, so the app came back in the exact previous state.
  _resetting = true
  if (_answerSaver && _answerSaver.saveTimeout != null) clearTimeout(_answerSaver.saveTimeout)
  if (!_sharedMode) clearStoredAnswers()
  // wipe shared token if present
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  window.location.reload()
}

function selectTopic(topic) {
  if (_activeTopic === topic) topic = null
  setActiveTopic(topic)
  updateProPercent()
  Object.keys(_answers).forEach((key) => {
    const answer = _answers[key]
    const question = answer.question
    if (question.topic === topic || topic === null) {
      _network.changeNode({ id: question._id, fillOpacity: 1.0, hoverable: true })
    } else {
      _network.changeNode({ id: question._id, fillOpacity: 0.05, hoverable: false })
    }
  })
  bus.emit('topic')
}

// ---- init ------------------------------------------------------------------
function start(opts = {}) {
  const sharedAnswers = opts.sharedAnswers || null
  _sharedMode = !!sharedAnswers

  setShowEvaluation(false)
  refreshRadius()
  refreshLinkDistances()

  _network = new Network('#bubbles-container', _radiusMax)
  for (let i = 0; i < _colors.length; i++) {
    _network.appendGradient('color_' + i, '#' + _colors[i][0], '#' + _colors[i][1])
  }

  _network.onNodeClick((d) => {
    gotoQuestionIndex(d.qIndex)
    _beforeHoverIndex = null
    _beforeHoverShowEvaluation = null
    setShowEvaluation(false)
    $('#content').fadeIn(200)
    $('#bubbles-container').removeClass('dim')
  })

  _network.onNodeHover((d) => {
    if (d != null) {
      if (_activeTopic != null && !d.hoverable) return
      if (_beforeHoverIndex == null) _beforeHoverIndex = _questionIndex
      setQuestionIndex(d.qIndex)
      if (_beforeHoverShowEvaluation == null) _beforeHoverShowEvaluation = _showEvaluation
      setShowEvaluation(false)
    } else {
      if (_beforeHoverIndex != null) {
        setQuestionIndex(_beforeHoverIndex)
        _beforeHoverIndex = null
      }
      if (_beforeHoverShowEvaluation != null) {
        setShowEvaluation(_beforeHoverShowEvaluation)
        _beforeHoverShowEvaluation = null
      }
    }
  })

  _numQuestions = Questions.find().count()

  // clusters & topics, in question order
  const clusters = []
  const topics = []
  Questions.find({}, { sort: { index: 1 } }).forEach((q) => {
    if (clusters.indexOf(q.cluster) === -1) clusters.push(q.cluster)
    if (topics.indexOf(q.topic) === -1) topics.push(q.topic)
  })
  _clusters = clusters
  _topics = topics

  _answerSaver = new AnswerSaver()
  upsertClusters()

  _chain = new Chain(_network)
  _pitcher = new Pitcher(_network)
  _field = new Field(_network)

  $(window).resize(resize)

  // load saved / shared answers
  const saved = sharedAnswers || loadStoredAnswers()

  Questions.find({}, { sort: { index: 1 } }).forEach((question) => {
    const savedAnswer = saved.get(question._id)
    if (savedAnswer != null) {
      const answer = Object.assign({}, savedAnswer, { question, questionId: question._id })
      if (answer.status === 'valid' || answer.status === 'dead') {
        answer.radius = _radiusScale(Math.abs(answer.value))
        answer.position = 'field'
        _answers[question._id] = answer
        _field.buildAndCatch(answer)
      } else {
        answer.position = 'chain'
        _answers[question._id] = answer
        _chain.buildAndCatch(answer)
      }
    } else {
      const answer = {
        question: question,
        questionId: question._id,
        position: 'chain',
        status: 'new',
        radius: _radiusScale(Math.abs(0.25)),
      }
      _answers[question._id] = answer
      _chain.buildAndCatch(answer)
    }
  })

  updateProPercent()
  goNext()
  setTimeout(() => {
    resize()
    if (_questionIndex === -1) goNext()
  }, 500)

  // persist on page hide
  window.addEventListener('pagehide', () => _answerSaver && _answerSaver.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && _answerSaver) _answerSaver.flush()
  })
}

// ---- public API ------------------------------------------------------------
export const engine = {
  start,
  on: (ev, fn) => bus.on(ev, fn),
  // getters
  getQuestionIndex: () => _questionIndex,
  getProPercent: () => _proPercent,
  isShowInfo: () => _showInfo,
  isShowEvaluation: () => _showEvaluation,
  getActiveTopic: () => _activeTopic,
  getAnswer: (id) => _answers[id],
  getAnswersList: () => Object.keys(_answers).map((k) => _answers[k]),
  getTopics: () => _topics,
  getProPercentForTopic: (topic) => {
    const answers = []
    Object.keys(_answers).forEach((key) => {
      const a = _answers[key]
      if (a.question.topic === topic) answers.push(a)
    })
    return getProPercent(answers)
  },
  isSharedMode: () => _sharedMode,
  getNetwork: () => _network,
  getAnswersById: () => Object.assign({}, _answers),
  getPreviewMetrics: () => ({
    width: _network ? _network.width : 0,
    height: _network ? _network.height : 0,
    fieldWidth: getBubblesWidth() + _radiusMax,
  }),
  // actions
  setShowInfo,
  selectConsent,
  setImportance,
  clickNext,
  clickBack,
  toggleFavorite,
  gotoEvaluation,
  gotoQuestions,
  reset,
  selectTopic,
}

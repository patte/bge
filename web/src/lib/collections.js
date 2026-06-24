// A tiny in-memory stand-in for the Minimongo `Questions` collection so the
// ported game logic can keep using Questions.find / findOne / count just like
// the original Meteor code. Only the query shapes actually used by the app are
// supported: empty selector, { index } selector, and sort by index.
import questionsData from '../data/questions.json'

class Cursor {
  constructor(docs) {
    this._docs = docs
  }
  forEach(fn) {
    this._docs.forEach((d, i) => fn(d, i))
  }
  map(fn) {
    return this._docs.map((d, i) => fn(d, i))
  }
  fetch() {
    return this._docs.slice()
  }
  count() {
    return this._docs.length
  }
}

class QuestionCollection {
  constructor(docs) {
    this._docs = docs
  }
  _filter(selector = {}) {
    const keys = Object.keys(selector)
    if (keys.length === 0) return this._docs.slice()
    return this._docs.filter((d) => keys.every((k) => d[k] === selector[k]))
  }
  find(selector = {}, options = {}) {
    let docs = this._filter(selector)
    if (options.sort && options.sort.index) {
      const dir = options.sort.index
      docs = docs.slice().sort((a, b) => (a.index - b.index) * dir)
    }
    return new Cursor(docs)
  }
  findOne(selector = {}) {
    return this._filter(selector)[0]
  }
}

// Give every question a stable string _id (originally a Mongo ObjectId);
// node ids in the bubble graph are keyed off this.
const docs = questionsData
  .map((q) => ({ ...q, _id: 'q' + q.index }))
  .sort((a, b) => a.index - b.index)

export const Questions = new QuestionCollection(docs)
export const NUM_QUESTIONS = docs.length

// Exposed for the visual-test harness so it can diff the baked data against
// the legacy baseline's Minimongo `Questions` collection.
if (typeof window !== 'undefined') window.__BGE_QUESTIONS = docs

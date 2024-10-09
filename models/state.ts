import { Schema, model, models } from 'mongoose'

const StateSchema = new Schema({
  address: {
    type: String,
    required: [true, 'Address is required'],
    immutable: true
  },
  gameNumber: {
    type: Number,
    required: [true, 'Game number is required'],
    immutable: true
  },
  moveNumber: {
    type: Number,
    required: [true, 'Move number is required'],
    immutable: true
  },
  colour: {
    type: String,
    // enum: ["BONK", "SEND", "WIF", "BGG"],
    enum: ["Red", "Blue", "Yellow", "Green"],
    immutable: true
  },
  // After-Move Position
  position: {
    type: String,
    required: [true, 'Position is required'],
    immutable: true
  },
  // Move made to reach the above Position
  diceNumber: {
    type: String,
    immutable: true
  },
  price: {
    type: Number,
    immutable: true
  },
  signature: {
    type: String,
    immutable: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
})

// Create a unique index on gameNumber and moveNumber combination
StateSchema.index({ gameNumber: 1, moveNumber: 1 }, { unique: true })

const State = models.State || model('State', StateSchema)

export default State

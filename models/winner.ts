import { Schema, model, models } from 'mongoose'

const WinnerSchema = new Schema({
  gameNumber: {
    type: Number,
    required: [true, 'Game number is required'],
    immutable: true
  },
  colour: {
    type: String,
    // enum: ["BONK", "SEND", "WIF", "BGG"],
    enum: ["Red", "Blue", "Yellow", "Green"],
    immutable: true
  },
  totalPool: {
    type: Number,
    immutable: true
  },
  prizePool: {
    type: Number,
    immutable: true
  },
  isDistributed: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true
  }
})

// Create a unique index on gameNumber and moveNumber combination
WinnerSchema.index({ gameNumber: 1, moveNumber: 1 }, { unique: true })

const Winner = models.Winner || model('Winner', WinnerSchema)

export default Winner

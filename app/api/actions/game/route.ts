import { NextRequest } from 'next/server'
import { Action, CompletedAction, ActionGetResponse, ActionPostRequest, ActionPostResponse, ActionError, ACTIONS_CORS_HEADERS, createPostResponse, MEMO_PROGRAM_ID } from "@solana/actions"
import { Transaction, TransactionInstruction, PublicKey, ComputeBudgetProgram, Connection, clusterApiUrl, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js"
import {
  NATIVE_MINT,
  createSyncNativeInstruction,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createCloseAccountInstruction,
  createTransferInstruction,
  createBurnInstruction
} from "@solana/spl-token"
import { connectToDB } from '@/utils/database'
import State from '@/models/state'
import Winner from '@/models/winner'
import { GoogleAuth, IdTokenClient } from 'google-auth-library'
import { ACTION_URL, FASTAPI_URL, REWARD_URL, ADDRESS, SENDCOIN_MINT_ADDRESS, PRICE_PER_ROLL_LAMPORTS, SNAKES, LADDERS, REWARDS } from '../constants'

async function getIdentityToken(targetAudience: string): Promise<string> {
  const auth = new GoogleAuth()
  const client = await auth.getIdTokenClient(targetAudience)
  const idTokenClient = client as IdTokenClient

  // The token is automatically refreshed by the client as needed
  const tokenResponse = await idTokenClient.getRequestHeaders()
  const identityToken = tokenResponse.Authorization?.split(' ')[1]

  if (!identityToken) {
    throw new Error('Failed to retrieve identity token.')
  }

  return identityToken
}

export const GET = async (req: NextRequest) => {
  await connectToDB()

  try {
    let initialState = await State.findOne({ gameNumber: 1, moveNumber: 0 })

    if (!initialState) {
  
      initialState = new State({
        address: "1nc1nerator11111111111111111111111111111111",
        gameNumber: 1,
        moveNumber: 0,
        position: "0-0-0-0"
      })
  
      await initialState.save()
    }

    const latestState = await State.findOne().sort({ gameNumber: -1, moveNumber: -1 })

    const colours = ["Red", "Blue", "Yellow", "Green"]
    const colour = colours[latestState.moveNumber % colours.length]

    const position = latestState.position

    const FastApiIdentityToken = await getIdentityToken(FASTAPI_URL)

    const boardResponse = await fetch(`${FASTAPI_URL}/board?positions=${position}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FastApiIdentityToken}`
      }
    })
    const boardResponseData = await boardResponse.json()
    const board = boardResponseData.url
    console.log("Board: ", board)

    const payload: ActionGetResponse = {
      type: "action",
      icon: board,
      title: `Snakes & Ladders: Game ${latestState.gameNumber}`,
      label: 'Roll Dice',
      description: `\nYou are ${colour}`
    }

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS
    })

  } catch (error) {
    console.error('Failed: ', error)
  }
}

export const OPTIONS = GET

export const POST = async (req: NextRequest) => {
  await connectToDB()

  try {
    const body: any = await req.json()
    console.log("Body: ", body)

    let account: PublicKey

    try { 
      account = new PublicKey(body.account)
    } catch (err) {
      return new Response('Invalid account provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS
      })
    }

    console.log("Address:", account.toBase58())

    const latestState = await State.findOne().sort({ gameNumber: -1, moveNumber: -1 })

    const colours = ["Red", "Blue", "Yellow", "Green"]
    const colour = colours[latestState.moveNumber % colours.length]

    const positionArray_ = latestState.position.split('-').map(Number)
    const colourIndex_ = { Red: 0, Blue: 1, Yellow: 2, Green: 3 }[colour]
    const currentPosition_ = positionArray_[colourIndex_ as number]

    const diceNumbers = [1, 2, 3, 4, 5, 6]
    const diceNumber = diceNumbers[Math.floor(Math.random() * diceNumbers.length)]
    console.log("Dice Roll:", diceNumber)

    const quoteResponse = await (
      await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=SENDdRQtYMWaQrBroBrJ2Q53fgVuq95CV9UPGEvpCxa\
&amount=${PRICE_PER_ROLL_LAMPORTS}\
&slippageBps=100`)
    ).json()

    console.log({ quoteResponse })

    const outAmountThreshold = quoteResponse.otherAmountThreshold

    const isNext = req.nextUrl.searchParams.get('next')
    console.log("Is Next? ", isNext)

    const isClaimed = req.nextUrl.searchParams.get('claimed')
    console.log("Is Claimed? ", isClaimed)

    if (isClaimed === 'yes') {
      console.log("Body: ", body)
      if (body.signature) {
        const positionArray = latestState.position.split('-').map(Number)
        const colourIndex = { Red: 0, Blue: 1, Yellow: 2, Green: 3 }[colour]
        let newPositionValue = positionArray[colourIndex as number] + diceNumber

        positionArray[colourIndex as number] = newPositionValue
        const newPosition = positionArray.join('-')

        const latestFuckingState = await State.findOne().sort({ gameNumber: -1, moveNumber: -1 })
        const position = latestFuckingState.position
        const boardResponse = await fetch(`${FASTAPI_URL}/board?positions=${position}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const boardResponseData = await boardResponse.json()
        const board = boardResponseData.url
        console.log("Board: ", board)

        const latestFuckingColour = colours[latestFuckingState.moveNumber % colours.length]

        const payload: Action = {
          type: "action",
          icon: board,
          title: `Wanna roll again with ${latestFuckingColour}?`,
          label: 'Roll Dice',
          description: `\nyou claimed your prize`,
          links: {
            actions: [
              {
                href: `${ACTION_URL}/game?next=yes`,
                label: "Roll Dice"
              }
            ]
          }
        }

        return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })

      } else {
        console.log("No signature found!")
      }
    }

    if (isNext === 'yes') {
      console.log("Body: ", body)
      if (body.signature) {
        const positionArray = latestState.position.split('-').map(Number)
        const colourIndex = { Red: 0, Blue: 1, Yellow: 2, Green: 3 }[colour]
        let newPositionValue = positionArray[colourIndex as number] + diceNumber

        if (newPositionValue > 49) {
          console.log(`Dice roll would exceed the board, ignoring roll.`)

          const position = latestState.position
          const existingBoardResponse = await fetch(`${FASTAPI_URL}/board?positions=${position}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json'
            }
          })
          const existingBoardResponseData = await existingBoardResponse.json()
          const existingBoard = existingBoardResponseData.url
          console.log("Existing Board: ", existingBoard)

          const newState = new State({
            address: account.toBase58(),
            gameNumber: latestState.gameNumber,
            moveNumber: latestState.moveNumber + 1,
            position,
            diceNumber: "0",
            colour,
            price: outAmountThreshold,
            signature: body.signature
          })

          await newState.save()

          const latestColour = colours[newState.moveNumber % colours.length]

          const payload: Action = {
            type: "action",
            icon: existingBoard,
            title: `Wanna roll again with ${latestColour}?`,
            label: 'Roll Dice',
            description: `\nYou rolled a ${diceNumber} but it would exceed the board so your move is cancelled`,
            links: {
              actions: [
                {
                  href: `${ACTION_URL}/game`,
                  label: "Roll Dice"
                }
              ]
            }
          }
          return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })
        }

        let snakeMessage = ''

        for (const snake of SNAKES) {
          if (newPositionValue === snake.start) {
            snakeMessage = `Hit a snake! Going down from ${snake.start} to ${snake.end}`
            console.log(`Hit a snake! Going down from ${snake.start} to ${snake.end}`)
            newPositionValue = snake.end
            break
          }
        }

        let ladderMessage = ''

        for (const ladder of LADDERS) {
          if (newPositionValue === ladder.start) {
            ladderMessage = `Hit a ladder! Going up from ${ladder.start} to ${ladder.end}`
            console.log(`Hit a ladder! Going up from ${ladder.start} to ${ladder.end}`)
            newPositionValue = ladder.end
            break
          }
        }

        positionArray[colourIndex as number] = newPositionValue
        const newPosition = positionArray.join('-')

        const newState = new State({
          address: account.toBase58(),
          gameNumber: latestState.gameNumber,
          moveNumber: latestState.moveNumber + 1,
          position: newPosition,
          diceNumber: diceNumber.toString(),
          colour,
          price: outAmountThreshold,
          signature: body.signature
        })

        await newState.save()

        const latestFuckingState = await State.findOne().sort({ gameNumber: -1, moveNumber: -1 })
        const position = latestFuckingState.position
        const boardResponse = await fetch(`${FASTAPI_URL}/board?positions=${position}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        const boardResponseData = await boardResponse.json()
        const board = boardResponseData.url
        console.log("Board: ", board)

        const latestFuckingColour = colours[latestFuckingState.moveNumber % colours.length]

        if (newPositionValue === 49) {
          console.log(`${colour} player wins!`)

          const additionalMessage = snakeMessage || ladderMessage ? `\n${snakeMessage || ladderMessage}` : ''

          const payload: CompletedAction = {
            type: "completed",
            icon: board,
            title: `You won with ${colour}!`,
            label: 'SENDing rewards to your wallet!',
            description: `\nYou rolled a ${diceNumber}${additionalMessage}`
          }

          const totalPoolAggregation = await State.aggregate([
            {
              $match: { gameNumber: latestState.gameNumber }
            },
            {
              $group: {
                _id: null,
                totalPool: { $sum: "$price" }
              }
            }
          ])

          const totalPool = totalPoolAggregation[0].totalPool

          const winner  = new Winner({
            gameNumber: latestState.gameNumber,
            colour,
            totalPool,
            prizePool: Math.floor(totalPool / 2)
          })

          await winner.save()

          const rewardPayload = {
            winner: colour,
            gameNumber: latestState.gameNumber
          }

          const RewardIdentityToken = await getIdentityToken(REWARD_URL)

          fetch(REWARD_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RewardIdentityToken}`
            },
            body: JSON.stringify(rewardPayload)
          }).then(() => console.log("Reward request sent"))
            .catch((error) => console.error("Failed to send reward request:", error))

          const newState = new State({
            address: "1nc1nerator11111111111111111111111111111111",
            gameNumber: latestState.gameNumber + 1,
            moveNumber: 0,
            position: "0-0-0-0"
          })

          await newState.save()

          return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })

        } else {
          const reward = REWARDS.find(r => r.position === newPositionValue)

          const description = reward
            ? `You rolled a ${diceNumber} and earned ${reward.text}`
            : `You rolled a ${diceNumber}`

          const additionalMessage = snakeMessage || ladderMessage ? `\n${snakeMessage || ladderMessage}` : ''

          if (reward) {
            const payload: Action = {
              type: "action",
              icon: board,
              title: `Claim your prize!`,
              label: 'Claim Prize',
              description: `\n${description}${additionalMessage}`,
              links: {
                actions: [
                  {
                    href: `${ACTION_URL}/sideprize`,
                    label: "Claim Prize"
                  }
                ]
              }
            }

            return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })

          } else {
            const payload: Action = {
              type: "action",
              icon: board,
              title: `Wanna roll again with ${latestFuckingColour}?`,
              label: 'Roll Dice',
              description: `\n${description}${additionalMessage}`,
              links: {
                actions: [
                  {
                    href: `${ACTION_URL}/game`,
                    label: "Roll Dice"
                  }
                ]
              }
            }

            return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })
          }
        }
      } else {
        console.log("No signature found!")
      }
    }

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`)
    const transaction = new Transaction()

    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400_000
      }),
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 300_000 * 1
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from(`snakes_${colour}`, "utf-8"),
        keys: []
      })
    )

    const ATA_WSOL = await getAssociatedTokenAddress(NATIVE_MINT, account)
    console.log("Wrapped SOL ATA: ", ATA_WSOL.toBase58())

    const ATA_SEND = await getAssociatedTokenAddress(SENDCOIN_MINT_ADDRESS, account)
    console.log("Send ATA: ", ATA_SEND.toBase58())

    const WSOL_Info = await connection.getAccountInfo(ATA_WSOL)
    const SEND_Info = await connection.getAccountInfo(ATA_SEND)

    if (!WSOL_Info) {
      console.log(`Wrapped SOL ATA doesn't exist. Creating one now...`)
      const ATAIx = createAssociatedTokenAccountInstruction(
        account,
        ATA_WSOL,
        account,
        NATIVE_MINT
      )
      transaction.add(ATAIx)
    }

    if (!SEND_Info) {
      console.log(`Send ATA doesn't exist. Creating one now...`)
      const ATAIx = createAssociatedTokenAccountInstruction(
        account,
        ATA_SEND,
        account,
        SENDCOIN_MINT_ADDRESS
      )
      transaction.add(ATAIx)
    }

    // Get serialized transactions for the swap
    const instructions = await (
      await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: account.toString(),
          dynamicComputeUnitLimit: true
        })
      })
    ).json()

    if (instructions.error) {
      throw new Error("Failed to get swap instructions: " + instructions.error)
    }

    const { swapInstruction: swapInstructionPayload } = instructions

    const deserializeInstruction = (instruction: any) => {
      return new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((key: any) => ({
          pubkey: new PublicKey(key.pubkey),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: Buffer.from(instruction.data, "base64"),
      })
    }

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: account,
        toPubkey: ATA_WSOL,
        lamports: PRICE_PER_ROLL_LAMPORTS,
      }),
      createSyncNativeInstruction(ATA_WSOL),
      deserializeInstruction(swapInstructionPayload)
    )

    if (!WSOL_Info) {
      transaction.add(
        createCloseAccountInstruction(
          ATA_WSOL,
          account,
          account
        )
      )
    }

    const ADMIN_SEND_ATA = await getAssociatedTokenAddress( SENDCOIN_MINT_ADDRESS, ADDRESS )

    const ADMIN_SEND_Info = await connection.getAccountInfo(ADMIN_SEND_ATA)

    if (!ADMIN_SEND_Info) {
      console.log(`Send ATA for ADMIN doesn't exist. Creating one now...`)
      const ATAIx = createAssociatedTokenAccountInstruction(
        account,
        ADMIN_SEND_ATA,
        ADDRESS,
        SENDCOIN_MINT_ADDRESS
      )
      transaction.add(ATAIx)
    }

    transaction.add(
      createTransferInstruction(
        ATA_SEND,
        ADMIN_SEND_ATA,
        account,
        outAmountThreshold
      )
    )

    transaction.feePayer = account
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `You rolled a ${diceNumber}!`,
        links: {
          next: {
            type: "post",
            href: `${ACTION_URL}/game?next=yes`,
          }
        }
      }
    })

    return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })
  } catch (err) {
    console.error(err)
    return Response.json("An unknown error occured", { status: 500 })
  }
}

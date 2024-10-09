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
  getMint
} from "@solana/spl-token"
import { GoogleAuth, IdTokenClient } from 'google-auth-library'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { connectToDB } from '@/utils/database'
import State from '@/models/state'
import Winner from '@/models/winner'
import bs58 from 'bs58'
import { ACTION_URL, MAIL_URL, ADDRESS, REWARDS } from '../constants'

type Colour = 'Red' | 'Blue' | 'Yellow' | 'Green'

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

    const latestState = await State.findOne({ address: account.toBase58() }).sort({ gameNumber: -1, moveNumber: -1 })

    let playerPosition = 0

    if (latestState) {
      const positionArray = latestState.position.split('-').map(Number)

      const colourIndex: Record<Colour, number> = { Red: 0, Blue: 1, Yellow: 2, Green: 3 }

      const playerColour = latestState.colour as Colour
      playerPosition = positionArray[colourIndex[playerColour]]

      console.log(`Latest position for address ${account.toBase58()} (colour: ${playerColour}): ${playerPosition}`)

    } else {
      console.log(`No state found for address ${account.toBase58()}`)
      return new Response(JSON.stringify({ message: "You are not eligible for this prize coz no state was found!" }), {
        status: 403,
        headers: {
          ...ACTIONS_CORS_HEADERS,
          'Content-Type': 'application/json'
        }
      })
    }

    const reward = REWARDS.find(r => r.position === playerPosition)

    if (!reward) {
      return new Response(JSON.stringify({ message: "You are not eligible for any rewards at your current position!" }), {
        status: 403,
        headers: {
          ...ACTIONS_CORS_HEADERS,
          'Content-Type': 'application/json'
        }
      })
    }

    console.log(`Player is eligible for reward: ${reward.text} at position: ${playerPosition}`)

    const mailIdentityToken = await getIdentityToken(MAIL_URL)

    const mailResponse = await fetch(`${MAIL_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mailIdentityToken}`
      },
      body: JSON.stringify({ subject: 'some mfer received a reward in snakes & ladders', text: `Reward: ${reward.text}\nReceiver:${account.toBase58()}` })
    })
    const mailResponseData = await mailResponse.json()
    const { success } = mailResponseData
    console.log('Mail sent:', success)

    const secretClient = new SecretManagerServiceClient()
    const [response] = await secretClient.accessSecretVersion({ name: `projects/435887166123/secrets/snakes-private-key/versions/1` })
    if (!response.payload || !response.payload.data) {
      throw new Error('Secret payload is null or undefined')
    }
    const PRIVATE_KEY = response.payload.data.toString()

    // const PRIVATE_KEY = process.env.PRIVATE_KEY as string

    const KEYPAIR = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY))

    const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`)
    const transaction = new Transaction()

    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 100_000
      }),
      new TransactionInstruction({
        programId: new PublicKey(MEMO_PROGRAM_ID),
        data: Buffer.from(`sideprize_${reward.position}_${reward.text}`, "utf-8"),
        keys: []
      })
    )

    // Fetch mint information to get the decimals dynamically
    const tokenMintPublicKey = new PublicKey(reward.mint)
    const mintInfo = await getMint(connection, tokenMintPublicKey)
    const decimals = mintInfo.decimals

    console.log(`Token mint ${reward.mint} (${reward.amount}) has ${decimals} decimals`)

    // Calculate the amount in the smallest unit
    const amountInSmallestUnit = BigInt(reward.amount) * BigInt(10 ** decimals)

    const senderTokenAccount = await getAssociatedTokenAddress(
      tokenMintPublicKey,
      ADDRESS,
      false
    )

    const recipientPublicKey = new PublicKey(account.toBase58())

    // Get the recipient's associated token account
    const recipientTokenAccount = await getAssociatedTokenAddress(
      tokenMintPublicKey,
      recipientPublicKey,
      false
    )

    const recipientTokenAccountInfo = await connection.getAccountInfo(recipientTokenAccount)
    if (!recipientTokenAccountInfo) {
      console.log(`The recipient's ATA doesn't exist. Creating one now...`);

      const createATAIx = createAssociatedTokenAccountInstruction(
        recipientPublicKey, // Payer
        recipientTokenAccount,
        recipientPublicKey,
        tokenMintPublicKey
      )

      transaction.add(createATAIx)
    }

    const transferTx = createTransferInstruction(
      senderTokenAccount,
      recipientTokenAccount,
      ADDRESS,
      amountInSmallestUnit,
      []
    )

    transaction.add(transferTx)

    transaction.feePayer = account
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `You claimed ${reward.text}!`,
        links: {
          next: {
            type: "post",
            href: `${ACTION_URL}/game?claimed=yes`,
          }
        }
      },
      signers: [KEYPAIR]
    })

    return Response.json(payload, { headers: ACTIONS_CORS_HEADERS })

  } catch (err) {
    console.error(err)
    return Response.json("An unknown error occured", { status: 500 })
  }
}

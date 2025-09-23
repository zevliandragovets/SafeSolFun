-- CreateEnum
CREATE TYPE "public"."TransactionType" AS ENUM ('BUY', 'SELL');

-- CreateTable
CREATE TABLE "public"."tokens" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "bannerUrl" TEXT,
    "creatorAddress" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "bondingCurveAddress" TEXT NOT NULL,
    "totalSupply" BIGINT NOT NULL DEFAULT 1000000000,
    "currentSupply" BIGINT NOT NULL DEFAULT 0,
    "marketCap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "website" TEXT,
    "twitter" TEXT,
    "telegram" TEXT,
    "isGraduated" BOOLEAN NOT NULL DEFAULT false,
    "graduatedAt" TIMESTAMP(3),
    "rugScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "type" "public"."TransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "solAmount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."watchlists" (
    "id" TEXT NOT NULL,
    "userAddress" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."creator_fees" (
    "id" TEXT NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "claimedFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastClaimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_symbol_key" ON "public"."tokens"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_tokenAddress_key" ON "public"."tokens"("tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_bondingCurveAddress_key" ON "public"."tokens"("bondingCurveAddress");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_signature_key" ON "public"."transactions"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_userAddress_tokenId_key" ON "public"."watchlists"("userAddress", "tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "creator_fees_creatorAddress_tokenAddress_key" ON "public"."creator_fees"("creatorAddress", "tokenAddress");

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "public"."tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."watchlists" ADD CONSTRAINT "watchlists_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "public"."tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

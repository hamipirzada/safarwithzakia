-- AlterTable
ALTER TABLE "enquiry" ADD COLUMN     "submissionKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "enquiry_submissionKey_key" ON "enquiry"("submissionKey");


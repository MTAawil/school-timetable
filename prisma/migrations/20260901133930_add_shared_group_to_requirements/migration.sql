-- AlterTable
ALTER TABLE "TeachingRequirement" ADD COLUMN     "sharedTeachingGroupId" UUID;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_sharedTeachingGroupId_fkey" FOREIGN KEY ("sharedTeachingGroupId") REFERENCES "SharedTeachingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

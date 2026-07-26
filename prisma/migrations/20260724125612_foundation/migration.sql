-- CreateTable
CREATE TABLE "SystemHealthCheck" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemHealthCheck_pkey" PRIMARY KEY ("id")
);

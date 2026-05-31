import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tiers = [
    {
      tier: 'free',
      displayName: 'Free',
      monthlyQuota: 3,
      features: '[]',
      maxDevices: 1,
    },
    {
      tier: 'pro',
      displayName: 'Pro',
      monthlyQuota: 0,
      features: '["collaboration","marketplace"]',
      maxDevices: 2,
    },
    {
      tier: 'enterprise',
      displayName: 'Enterprise',
      monthlyQuota: 0,
      features: '["collaboration","marketplace"]',
      maxDevices: 5,
    },
  ];

  for (const t of tiers) {
    await prisma.tierConfig.upsert({
      where: { tier: t.tier },
      update: {},
      create: t,
    });
  }

  console.log('Tier config seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

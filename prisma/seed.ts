// backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const adminEmail = 'admin@mahavirfashion.com'
  const adminPassword = '123456' // Change this to your desired password
  const adminMobile = '918851607038' // Change this to YOUR real mobile (91 + number)

  // Hash the password
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  // Create or Update Admin
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      mobile: adminMobile,
      companyName: 'Mahavir Fashion HQ',
      role: 'ADMIN',
      isActive: true
    },
    create: {
      email: adminEmail,
      password: hashedPassword,
      mobile: adminMobile,
      companyName: 'Mahavir Fashion HQ',
      role: 'ADMIN',
      name: 'Super Admin',
      isActive: true
    },
  })

  console.log(`Created Admin User: ${admin.email}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
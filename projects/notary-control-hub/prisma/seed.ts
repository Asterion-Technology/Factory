import { PrismaClient } from "@prisma/client";
import { CHECKLIST_TEMPLATES } from "../src/lib/checklists";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Notary Control Hub...");

  // Seed user — replace clerkId with a real Clerk user ID for dev
  const user = await prisma.user.upsert({
    where: { clerkId: "user_seed_dev" },
    update: {},
    create: {
      clerkId: "user_seed_dev",
      email: "notary@example.com",
      notaryState: "CA",
    },
  });

  // Seed contacts
  const signingCo = await prisma.contact.upsert({
    where: { id: "seed-contact-1" },
    update: {},
    create: {
      id: "seed-contact-1",
      userId: user.id,
      type: "SIGNING_CO",
      name: "Jane Smith",
      company: "Pacific Signing Services",
      email: "jane@pacificsigning.example.com",
      phone: "555-234-5678",
      paymentTerms: "Net 30",
      preferredInstructions: "Scanbacks required within 1 hour of signing.",
    },
  });

  const borrower = await prisma.contact.upsert({
    where: { id: "seed-contact-2" },
    update: {},
    create: {
      id: "seed-contact-2",
      userId: user.id,
      type: "BORROWER",
      name: "Robert Johnson",
      email: "rjohnson@example.com",
      phone: "555-987-6543",
    },
  });

  // Seed assignment
  const assignment = await prisma.assignment.upsert({
    where: { id: "seed-assignment-1" },
    update: {},
    create: {
      id: "seed-assignment-1",
      userId: user.id,
      type: "LOAN_SIGNING",
      status: "CONFIRMED",
      contactId: signingCo.id,
      borrowerName: borrower.name,
      borrowerPhone: borrower.phone ?? undefined,
      borrowerEmail: borrower.email ?? undefined,
      appointmentAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days out
      address: "123 Main St, Sacramento, CA 95814",
      fee: 125.0,
      travelFee: 15.0,
      printingFee: 10.0,
      scanbackRequired: true,
    },
  });

  // Seed checklists for the assignment
  for (const templateType of ["PREFLIGHT", "NSA"] as const) {
    const checklist = await prisma.assignmentChecklist.upsert({
      where: {
        assignmentId_templateType: {
          assignmentId: assignment.id,
          templateType,
        },
      },
      update: {},
      create: {
        assignmentId: assignment.id,
        templateType,
      },
    });

    const items = CHECKLIST_TEMPLATES[templateType];
    for (let i = 0; i < items.length; i++) {
      await prisma.assignmentChecklistItem.upsert({
        where: { id: `seed-item-${templateType}-${i}` },
        update: {},
        create: {
          id: `seed-item-${templateType}-${i}`,
          checklistId: checklist.id,
          label: items[i],
          sortOrder: i,
        },
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

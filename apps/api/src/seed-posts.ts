// Run with: npx payload run ./src/seed-posts.ts
// Seeds the initial blog content (Posts collection) for SEO. Uses
// overrideAccess: true throughout, same reasoning as seed.ts - a trusted
// server-side script, not a user-facing request. Builds Lexical rich-text
// state programmatically (paragraph/heading/list node helpers) rather than
// hand-writing raw JSON for each post, since Lexical's serialized shape is
// easy to get subtly wrong by hand.
import { getPayload } from 'payload';
import config from './payload.config.ts';

type LexicalNode = Record<string, unknown>;

function text(value: string): LexicalNode {
  return { type: 'text', text: value, detail: 0, format: 0, mode: 'normal', style: '', version: 1 };
}

function paragraph(value: string): LexicalNode {
  return {
    type: 'paragraph',
    children: [text(value)],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

function heading(tag: 'h2' | 'h3', value: string): LexicalNode {
  return {
    type: 'heading',
    tag,
    children: [text(value)],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  };
}

function bulletList(items: string[]): LexicalNode {
  return {
    type: 'list',
    listType: 'bullet',
    tag: 'ul',
    start: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    children: items.map((item) => ({
      type: 'listitem',
      value: 1,
      children: [text(item)],
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    })),
  };
}

// Typed `any` deliberately: Payload's generated type for a richText field's
// value is stricter (and more specific per-node) than this script's own
// loose LexicalNode helper shape needs to satisfy - this is a one-off seed
// script, not user-facing code, and the local dev run this was verified
// against already proved this exact JSON shape is accepted and renders
// correctly through @payloadcms/richtext-lexical/react.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richText(children: LexicalNode[]): any {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  };
}

const POSTS: Array<{ title: string; slug: string; excerpt: string; publishedAt: string; body: LexicalNode[] }> = [
  {
    title: "Why your till's revenue number isn't your profit number",
    slug: 'revenue-vs-profit-small-shop',
    excerpt:
      "Two shops can ring up the exact same sales total and end the month in completely different places. Here's the number that actually matters, and why most small shops never see it.",
    publishedAt: '2026-06-02',
    body: [
      paragraph(
        "If you run a shop, you already know your revenue - it's the till tape, the M-Pesa statement, the total at the end of the day. What most owners don't have is the other number: what you actually kept after the cost of what you sold.",
      ),
      heading('h2', 'Revenue tells you what came in. Margin tells you what you keep.'),
      paragraph(
        'Say you sold KES 50,000 worth of stock today. That sounds like a good day. But if the goods you sold cost you KES 42,000 to buy, you kept KES 8,000 - and that\'s before rent, staff, and everything else. Two shops can post the exact same "good day" revenue number and be in completely different financial positions, because revenue alone can\'t tell them apart.',
      ),
      heading('h2', 'Why owners rarely see this number'),
      paragraph(
        'For most small businesses, cost price and sell price live in different places - a supplier receipt here, a notebook there, a rough memory of "I think I paid about this much." By the time you\'re trying to work out real margin at the end of the month, you\'re reconstructing it from memory across dozens or hundreds of products.',
      ),
      heading('h2', 'What to actually track'),
      bulletList([
        'Cost price per product, kept up to date every time you restock',
        'Margin by product - some items look busy but barely make anything',
        'Margin by store, if you run more than one branch',
        'Margin by shift, if you want to know whether a particular cashier or time of day is unusually discount-heavy',
      ]),
      paragraph(
        "This is exactly the gap Fundi POS is built to close - cost price stays visible to the owner only, and every sale is automatically turned into real margin, by product, by store, by shift, without anyone having to reconstruct it by hand at month-end.",
      ),
    ],
  },
  {
    title: 'KRA eTIMS in 2026: what small businesses actually need to do',
    slug: 'kra-etims-2026-small-business-guide',
    excerpt:
      "eTIMS compliance is no longer optional for expense claims. Here's a plain-language breakdown of what changed, who it affects, and how to get ready without panicking.",
    publishedAt: '2026-04-14',
    body: [
      paragraph(
        'Starting January 2026, the Kenya Revenue Authority tightened enforcement around eTIMS (electronic Tax Invoice Management System): expenses without a valid eTIMS invoice generally can\'t be claimed as a deductible business expense. If you sell to other businesses, or you want your own purchases to count for tax purposes, this affects you directly.',
      ),
      heading('h2', 'What eTIMS actually requires'),
      paragraph(
        'In short: every invoice you issue needs to be generated through an eTIMS-compliant system and carry the tax details KRA expects - not a handwritten receipt, and not a generic PDF with no tax registration reference.',
      ),
      heading('h2', 'Who this affects most'),
      bulletList([
        'Shops that sell to other registered businesses, where the buyer needs a valid invoice to claim the expense',
        'Any business that wants its own supplier purchases to count as deductible expenses',
        'Businesses that are VAT-registered or approaching the registration threshold',
      ]),
      heading('h2', 'Getting ready without the panic'),
      paragraph(
        "The practical fix is a POS system with eTIMS-ready invoicing built in, so compliant invoices are just what comes out of a normal sale - not a separate process you have to remember. Fundi POS's itemized tax breakdowns and eTIMS invoice fields are built exactly for this, so switching on compliance is a settings change, not a rebuild of how your till works.",
      ),
    ],
  },
  {
    title: 'Running your shop through blackouts and dead zones',
    slug: 'running-shop-through-blackouts',
    excerpt:
      "Load-shedding and patchy internet aren't rare events for most Kenyan shops - they're a normal Tuesday. Here's what actually breaks when your POS assumes a perfect connection, and what doesn't.",
    publishedAt: '2026-03-10',
    body: [
      paragraph(
        "For a lot of POS software, a power cut or a dropped connection means the till simply stops working - no sales, no receipts, a queue of customers standing at the counter while you apologize and reach for a calculator.",
      ),
      heading('h2', "What actually needs to survive a blackout"),
      bulletList([
        'Ringing up a sale and printing or showing a receipt',
        'Adjusting stock as items sell',
        'Cash and M-Pesa transactions both being recorded correctly',
        'Nothing getting double-counted or lost once the connection comes back',
      ]),
      heading('h2', 'How this should actually work'),
      paragraph(
        "A till that runs on its own local database keeps ringing up sales with no connection at all, and syncs automatically the moment it's back online - every sale gets its own unique identity the instant it's created, so nothing is double-counted or overwritten even if two tills reconnect at the same time. That's the model Fundi POS is built on: offline isn't a fallback mode bolted on afterward, it's how the till works by default.",
      ),
      paragraph(
        "The point isn't that offline capability is the whole story - it's table stakes for actually running a shop in Kenya. The more interesting question is what you do with the sales data once it's back online, which is where real margin and multi-store reporting come in.",
      ),
    ],
  },
  {
    title: 'Comparing margins across multiple stores: what to look for',
    slug: 'comparing-margins-across-multiple-stores',
    excerpt:
      "Running two or more branches means you're no longer just asking 'are we profitable' - you're asking 'which branch, which staff, which products.' Here's how to actually compare them fairly.",
    publishedAt: '2026-07-08',
    body: [
      paragraph(
        "The moment you open a second branch, a single profit number stops being useful. One store might be quietly excellent while another is dragging the average down - and you won't see it unless you're looking at each store's own numbers, not just the combined total.",
      ),
      heading('h2', 'Comparing stores fairly'),
      bulletList([
        'Compare margin percentage, not just total profit - a smaller store can have a healthier margin than a bigger one',
        'Look at the same product lines across stores where possible, since a different product mix will naturally shift the numbers',
        'Watch for one store quietly discounting more than the others',
        'Check margin by shift too - the same store can look different across different cashiers or times of day',
      ]),
      heading('h2', 'Why this needs to be built in, not bolted on'),
      paragraph(
        "Doing this by hand means pulling numbers from each branch separately and reconciling them - realistically, most owners just don't, and the comparison never happens. Fundi POS's multi-store reporting shows revenue, margin, and average order value side by side across every branch and shift, from one owner login, so the comparison is just something you can glance at rather than a project.",
      ),
    ],
  },
  {
    title: 'Choosing a POS system for a small shop in Kenya: a practical checklist',
    slug: 'choosing-pos-system-kenya-checklist',
    excerpt:
      "Most POS comparisons focus on features that don't matter for a small shop and skip the ones that do. Here's what's actually worth checking before you commit.",
    publishedAt: '2026-08-01',
    body: [
      paragraph(
        "There's no shortage of point-of-sale software out there, and most of it is built with a generic retail checklist in mind rather than the specific realities of running a small shop in Kenya. Here's what's actually worth checking.",
      ),
      heading('h2', "Does it work when the power or the internet doesn't?"),
      paragraph(
        "This should be a non-negotiable, not a premium feature. Ask specifically what happens to an in-progress sale if the connection drops mid-transaction, not just whether the app 'has offline mode.'",
      ),
      heading('h2', 'Does it take M-Pesa at the till itself?'),
      paragraph(
        "If M-Pesa is bolted on as a separate step outside the POS, that's friction on every single sale, all day, every day. It should be one tender option alongside cash, not a workaround.",
      ),
      heading('h2', 'Can you actually see your margins, not just your sales?'),
      paragraph(
        "Ask directly: does the system show cost price and true profit, or only revenue? A lot of POS software stops at revenue reporting, which tells you what came in but not what you kept.",
      ),
      heading('h2', "Is it ready for eTIMS?"),
      paragraph(
        'With eTIMS enforcement now affecting expense claims, ask whether invoices come out compliant by default, or whether that\'s a manual workaround you\'ll be doing by hand.',
      ),
      heading('h2', 'Does pricing actually fit a business your size?'),
      paragraph(
        "A lot of retail POS pricing is built around large stores with big transaction volumes. Look for a plan that starts small - a single till, a free trial with no card required - and grows only when you actually open a second branch.",
      ),
    ],
  },
];

async function seedPosts() {
  const payload = await getPayload({ config });

  for (const post of POSTS) {
    const existing = await payload.find({
      collection: 'posts',
      where: { slug: { equals: post.slug } },
      limit: 1,
      overrideAccess: true,
    });
    if (existing.docs.length > 0) {
      console.log(`Skipping "${post.title}" - slug already exists.`);
      continue;
    }

    const created = await payload.create({
      collection: 'posts',
      data: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: richText(post.body),
        publishedAt: post.publishedAt,
        status: 'published',
      },
      overrideAccess: true,
    });
    console.log(`Created post: ${created.id} (${post.slug})`);
  }
}

try {
  await seedPosts();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}

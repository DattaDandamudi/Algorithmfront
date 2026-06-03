/*
  # Add Role-Based Bios to Contributors

  Adds a tailored one-line bio for every contributor based on their role,
  giving each card a meaningful description. Lasya Dandamudi keeps her
  existing founder bio and is excluded from the update.

  1. Updates
    - Sets the `bio` column for all 32 non-founder contributors with a
      role-appropriate description.
    - Founder bio (Lasya Dandamudi) is preserved.

  2. Notes
    - Bios are short (single sentence), aimed at landing-page cards.
    - Tone is consistent with the existing brand voice.
*/

-- Data Engineers
UPDATE contributors SET bio = 'Builds and maintains the data pipelines that power Algoritm''s voice intelligence at scale.' WHERE name = 'Vishal';
UPDATE contributors SET bio = 'Bridges enterprise systems and conversational AI, translating complex SAP workflows into clean voice experiences.' WHERE name = 'Sai Narmada';
UPDATE contributors SET bio = 'Designs resilient data pipelines that keep millions of conversations flowing without a beat dropped.' WHERE name = 'Vivekananda';
UPDATE contributors SET bio = 'Engineers the ingestion and transformation layers that turn raw audio into structured intelligence.' WHERE name = 'Naveen Reddy Veena';
UPDATE contributors SET bio = 'Owns the lifecycle of data — from ingestion to insight — keeping every signal clean and actionable.' WHERE name = 'Deepak';
UPDATE contributors SET bio = 'Crafts dependable data flows that make every conversation measurable and every insight reachable.' WHERE name = 'Sai Sindhu';
UPDATE contributors SET bio = 'Turns conversation data into clear narratives, surfacing the patterns that shape product decisions.' WHERE name = 'Thushara Priya';
UPDATE contributors SET bio = 'Stewards the data backbone — designing schemas and pipelines that scale with conversational growth.' WHERE name = 'Harshita Puli';
UPDATE contributors SET bio = 'Keeps the data flowing reliably from edge to warehouse, so insight is always one query away.' WHERE name = 'Murali';
UPDATE contributors SET bio = 'Pairs AI with robust data engineering — building the feature stores and pipelines our models learn from.' WHERE name = 'Sai Naresh Pakki';
UPDATE contributors SET bio = 'Reads between the lines of conversation data, turning signals into stories the team can act on.' WHERE name = 'Eesha Venkat Pasupuleti';
UPDATE contributors SET bio = 'Architects high-throughput data pipelines tuned for speech and multilingual workloads.' WHERE name = 'Jaswanth';
UPDATE contributors SET bio = 'Builds the data foundations that let models learn from millions of multilingual conversations.' WHERE name = 'Raghu Ram Ravi';
UPDATE contributors SET bio = 'Writes the pipelines that transform raw call audio into the structured datasets our models depend on.' WHERE name = 'Emmanith Bussa';
UPDATE contributors SET bio = 'Maintains the data infrastructure that keeps every conversation observable and every model trainable.' WHERE name = 'Sireesha';
UPDATE contributors SET bio = 'Translates raw conversation data into the insights that guide product, language, and model decisions.' WHERE name = 'Pranathi Guntaka';
UPDATE contributors SET bio = 'Surfaces the patterns hidden inside thousands of calls — the data analyst behind every product instinct.' WHERE name = 'Khadar Basha Shaik';

-- Engineering & Design
UPDATE contributors SET bio = 'Ships full-stack experiences end to end — from API to interface — with an obsession for performance and polish.' WHERE name = 'Rohith Sesha Sai Maddina';
UPDATE contributors SET bio = 'Connects backend services and frontend craft, building the seamless surfaces that hold our voice product together.' WHERE name = 'Neha Anuganti';
UPDATE contributors SET bio = 'Bridges design taste and engineering rigor — shaping the surfaces and systems people actually love to use.' WHERE name = 'Tejasree';
UPDATE contributors SET bio = 'Designs and builds the product experience — turning brand and interaction into shippable, polished UI.' WHERE name = 'Sai Abhilash';
UPDATE contributors SET bio = 'Builds product features end to end with a designer''s eye for detail and an engineer''s discipline.' WHERE name = 'Manoj Sai';
UPDATE contributors SET bio = 'Crafts thoughtful product surfaces — pairing systems thinking with a relentless focus on user feel.' WHERE name = 'Sai Mohith';
UPDATE contributors SET bio = 'Engineers the experience layer — translating ideas into interfaces that feel quietly inevitable.' WHERE name = 'Mohan Ayyappa';
UPDATE contributors SET bio = 'Builds the product surfaces and tooling that make complex AI feel approachable and elegant.' WHERE name = 'Harshavardhan';
UPDATE contributors SET bio = 'Designs interactions and writes the code behind them — closing the gap between intent and shipped product.' WHERE name = 'Mohith Panchumarthi';
UPDATE contributors SET bio = 'Writes the software that turns research into a product — focused on clean code and crisp interactions.' WHERE name = 'Kusuma Bayya';
UPDATE contributors SET bio = 'Pairs engineering and design to ship product features that feel handcrafted at every interaction.' WHERE name = 'Sai Aniketh';
UPDATE contributors SET bio = 'Trains and tunes the AI/ML models that make every voice agent sound natural, fluent, and on-brand.' WHERE name = 'Sai Nikhil Dunuka';
UPDATE contributors SET bio = 'Leads AI/ML engineering — building the model stack that powers Algoritm''s multilingual voice intelligence.' WHERE name = 'Nikhil Mattapalli';
UPDATE contributors SET bio = 'Trains the language and speech models that give our voice agents their range, nuance, and accuracy.' WHERE name = 'Surya Teja Koritala';
UPDATE contributors SET bio = 'Builds the engineering and design systems behind a product that has to feel effortless from the first hello.' WHERE name = 'Arjun Kumar';

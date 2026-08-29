import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { pageEnter, staggerParent, riseChild } from '../../design/motion';
import { currentDaypart, DAYPART_LABEL } from '../../lib/time';
import { useCatalog } from '../catalog/useCatalog';
import { RestaurantCard } from '../catalog/components/RestaurantCard';
import { useFeed } from '../recommendations/useFeed';
import { BentoHero } from './BentoHero';
import { FeedRow } from './FeedRow';

export default function DiscoverPage() {
  const catalog = useCatalog();
  const daypart = currentDaypart();
  const { rows } = useFeed();

  return (
    <motion.div {...pageEnter}>
      <header className="py-6">
        <p className="label-caps">Good {DAYPART_LABEL[daypart]}</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-semibold sm:text-5xl">
          Every checkout total,{' '}
          <em className="font-display italic text-terracotta">before</em> you order
        </h1>
      </header>

      <BentoHero />

      <div className="mt-12 space-y-12">
        {rows.map((row) => (
          <FeedRow key={row.key} row={row} />
        ))}

        <section aria-labelledby="all-restaurants">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="all-restaurants" className="text-2xl font-semibold">
              Every kitchen
            </h2>
            <Link
              to="/search"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-terracotta transition-colors hover:text-terracotta-press"
            >
              Search instead <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <motion.div
            variants={staggerParent}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.05 }}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {catalog.restaurants.map((r) => (
              <motion.div key={r.id} variants={riseChild}>
                <RestaurantCard restaurant={r} />
              </motion.div>
            ))}
          </motion.div>
        </section>
      </div>
    </motion.div>
  );
}

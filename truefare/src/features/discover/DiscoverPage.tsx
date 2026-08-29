import { motion } from 'motion/react';
import { pageEnter, staggerParent, riseChild } from '../../design/motion';
import { currentDaypart, DAYPART_LABEL } from '../../lib/time';
import { useCatalog } from '../catalog/useCatalog';
import { RestaurantCard } from '../catalog/components/RestaurantCard';

export default function DiscoverPage() {
  const catalog = useCatalog();
  const daypart = currentDaypart();

  return (
    <motion.div {...pageEnter}>
      <header className="py-6">
        <p className="label-caps">Good {DAYPART_LABEL[daypart]}</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-semibold sm:text-5xl">
          Every checkout total,{' '}
          <em className="font-display italic text-terracotta">before</em> you order
        </h1>
      </header>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {catalog.restaurants.map((r) => (
          <motion.div key={r.id} variants={riseChild}>
            <RestaurantCard restaurant={r} />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

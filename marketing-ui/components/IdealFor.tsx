'use client';

const categories = [
  'STEM OPT / H-1B',
  'Recent grads',
  'Laid-off engineers',
  'Remote job hunters',
];

export default function IdealFor() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-primary-50 via-secondary-50 to-primary-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 mb-4">
            Ideal for
          </h2>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {categories.map((category, index) => (
            <div
              key={index}
              className="px-8 py-4 bg-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 font-semibold text-lg text-slate-700 border-2 border-slate-200 hover:border-primary-300"
            >
              {category}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}



import React, { useMemo, useState } from "react";
import brandsData from "./data/brands.json";

const Stat = ({ value, label }) => (
  <div className="card p-6">
    <div className="text-4xl font-black text-brand-400">{value}</div>
    <p className="mt-2 text-sm subtle">{label}</p>
  </div>
);

const BrandCard = ({ b }) => (
  <article className="card p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="font-bold text-lg">{b.name}</h4>
        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full border border-white/15">{b.sector}</span>
      </div>
      <a className="text-sm underline" target="_blank" rel="noreferrer" href={b.link || "#"}>Kaynak</a>
    </div>
    <p className="mt-2 text-sm subtle">{b.rationale}</p>
  </article>
);

export default function App(){
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const sectors = useMemo(() => Array.from(new Set(brandsData.map(b => b.sector))), []);
  const filtered = useMemo(() => brandsData.filter(b => {
    const matchesQ = (b.name + " " + b.sector + " " + b.rationale).toLowerCase().includes(q.toLowerCase());
    const matchesS = !sector || b.sector === sector;
    return matchesQ && matchesS;
  }), [q, sector]);

  return (
    <div>
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur">
        <nav className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 font-black">FB</span>
            <span className="font-semibold">Filistin İçin Boykot</span>
          </a>
          <div className="hidden md:flex gap-6 text-sm">
            <a href="#gercekler" className="hover:underline">Gerçekler</a>
            <a href="#hikayeler" className="hover:underline">Tanıklıklar</a>
            <a href="#boykot" className="hover:underline">Boykot</a>
            <a href="#kaynaklar" className="hover:underline">Kaynaklar</a>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="px-4 py-20 text-center max-w-3xl mx-auto">
        <div className="kicker">Sessiz kalma</div>
        <h1 className="heading">Soykırımı Görmezden Gelme</h1>
        <p className="mt-4 text-lg subtle">
          İsrail’in saldırılarıyla yıkılan hayatlar, açlık ve kuşatma… Bu bir savaş değil, bu bir <span className="font-bold text-brand-300">soykırımdır</span>.
          Okudukça, gördükçe tek bir gerçek kalıyor: <span className="font-semibold">boykot</span>, şiddetsiz direnişin en güçlü aracıdır.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <a href="#boykot" className="btn btn-primary">Boykota Katıl</a>
          <a href="#gercekler" className="btn btn-ghost">Gerçekleri Gör</a>
        </div>
      </section>

      {/* FACTS */}
      <section id="gercekler" className="py-16 bg-black/60">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-extrabold mb-6">Çarpıcı Gerçekler</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Stat value="+4000" label="Çocuk hayatını kaybetti (BM verileri)" />
            <Stat value="%80" label="Gazze halkı yerinden edildi" />
            <Stat value="+200" label="Okul ve hastane yıkıldı" />
          </div>
          <p className="text-xs subtle mt-3">*Lütfen bu sayıları kendi güncel ve doğrulanmış kaynaklarınızla güncelleyin.</p>
        </div>
      </section>

      {/* STORIES */}
      <section id="hikayeler" className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-extrabold mb-6">Tanıklıklar</h2>
          <div className="grid gap-4">
            <blockquote className="card p-6 italic">“Gözlerimin önünde kardeşim enkaz altında kaldı.” — 12 yaşında, Gazze.</blockquote>
            <blockquote className="card p-6 italic">“Elektrik yok. Suyu kuyruğa girerek alıyoruz. Çocuklar aç.” — Bir anne, Gazze.</blockquote>
          </div>
        </div>
      </section>

      {/* BOYCOTT */}
      <section id="boykot" className="py-16 bg-black/60">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-3xl font-extrabold">Boykot Rehberi</h2>
              <p className="subtle mt-2">Her alışveriş bir oydur. İsrail’i destekleyen yapılara para kazandırma.</p>
            </div>
            <div className="flex gap-2 items-center">
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Ara: sektör/marka" className="rounded-xl bg-white/5 border border-white/15 px-3 py-2" />
              <select value={sector} onChange={e=>setSector(e.target.value)} className="rounded-xl bg-white/5 border border-white/15 px-3 py-2">
                <option value="">Sektör: Tümü</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mt-6">
            {filtered.map(b => <BrandCard key={b.name} b={b} />)}
          </div>
          <details className="mt-4 card p-4 text-sm">
            <summary className="font-semibold cursor-pointer">Listeleri nasıl doğrularım?</summary>
            <ul className="list-disc pl-6 mt-2 subtle space-y-1">
              <li>Resmî açıklamalar ve bağımsız raporları çapraz doğrula.</li>
              <li>Kaynak linki ve tarih belirt.</li>
              <li>Şüpheli bilgiyi “doğrulama bekleniyor” olarak işaretle.</li>
            </ul>
          </details>
        </div>
      </section>

      {/* RESOURCES */}
      <section id="kaynaklar" className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-extrabold mb-6">Kaynaklar</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <a className="card p-4 hover:bg-white/10" target="_blank" href="https://www.un.org/">Birleşmiş Milletler (UN)</a>
            <a className="card p-4 hover:bg白/10" target="_blank" href="https://www.amnesty.org/">Amnesty International</a>
            <a className="card p-4 hover:bg-white/10" target="_blank" href="https://www.unicef.org/">UNICEF</a>
            <a className="card p-4 hover:bg-white/10" target="_blank" href="https://www.icrc.org/">Kızılhaç/Kızılay (ICRC)</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 border-t border-white/10 text-center subtle text-sm">
        © {new Date().getFullYear()} Filistin İçin Boykot — Sessiz kalma.
      </footer>
    </div>
  );
}

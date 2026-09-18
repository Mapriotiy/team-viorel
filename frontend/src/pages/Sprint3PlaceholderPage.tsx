export function Sprint3PlaceholderPage({ title, onBack }: { title: string; onBack: () => void }) {
    return <main className="min-h-screen bg-transparent p-8 text-white"><button onClick={onBack} className="mb-6 text-orange-300">← Back</button><h1 className="text-3xl font-bold">{title}</h1><p className="mt-3 max-w-xl text-white/60">This feature is planned for Sprint 3. The Sprint 2 shell is ready and this placeholder keeps navigation functional.</p></main>;
}

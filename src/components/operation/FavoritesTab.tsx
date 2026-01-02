import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Spinner } from '@/components/ui/spinner';
import { Star, StarOff } from 'lucide-react';
import type { FavoriteStatus } from '@/lib/types';

export default function FavoritesTab() {
  const { currentSite } = useSite();
  const [favorites, setFavorites] = useState<FavoriteStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchFavorites = async () => {
    if (!currentSite) return;
    setLoading(true);

    const { data: favs } = await supabase
      .from('favorites')
      .select('*, people(*)')
      .eq('site_id', currentSite.id);

    const peopleIds = (favs || []).map(f => (f.people as any)?.id).filter(Boolean);

    const { data: logs } = await supabase
      .from('access_logs')
      .select('person_id, entry_at')
      .eq('site_id', currentSite.id)
      .is('exit_at', null)
      .is('voided_at', null)
      .in('person_id', peopleIds);

    const insideMap = new Map((logs || []).map(l => [l.person_id, l.entry_at]));

    const result: FavoriteStatus[] = (favs || []).map(f => {
      const p = f.people as any;
      const entryAt = insideMap.get(p.id);
      const hours = entryAt ? (Date.now() - new Date(entryAt).getTime()) / 3600000 : null;
      return {
        id: f.id,
        person_id: p.id,
        full_name: p.full_name,
        ci: p.ci,
        contractor: p.contractor,
        type: p.type,
        is_inside: !!entryAt,
        entry_at: entryAt || null,
        hours,
        status: hours ? (hours >= 12 ? 'crit' : hours >= 10 ? 'warn' : 'ok') : null,
      };
    });

    setFavorites(result);
    setLoading(false);
  };

  useEffect(() => { fetchFavorites(); }, [currentSite]);

  const handleSearch = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);

    const { data } = await supabase
      .from('people')
      .select('*')
      .eq('site_id', currentSite.id)
      .or(`ci.eq.${query.trim()},full_name.ilike.%${query.trim()}%`)
      .limit(10);

    setSearchResults(data || []);
    setSearching(false);
  };

  const toggleFavorite = async (personId: string, isFav: boolean) => {
    if (!currentSite) return;

    if (isFav) {
      await supabase.from('favorites').delete().eq('site_id', currentSite.id).eq('person_id', personId);
    } else {
      await supabase.from('favorites').insert({ site_id: currentSite.id, person_id: personId });
    }
    fetchFavorites();
    setSearchResults([]);
    setQuery('');
  };

  return (
    <div className="operation-panel space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Star className="w-6 h-6 text-primary" />
        <h2 className="text-lg font-medium">Favoritos</h2>
      </div>

      <div className="flex gap-3">
        <SearchInput
          placeholder="Agregar favorito por CI o nombre..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          containerClassName="flex-1"
        />
        <Button onClick={handleSearch} disabled={searching}>
          {searching ? <Spinner size="sm" /> : 'Buscar'}
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-2">
          {searchResults.map((p) => {
            const isFav = favorites.some(f => f.person_id === p.id);
            return (
              <div key={p.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div>
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">CI: {p.ci}</p>
                </div>
                <Button variant={isFav ? 'secondary' : 'default'} size="sm" onClick={() => toggleFavorite(p.id, isFav)}>
                  {isFav ? <StarOff className="w-4 h-4 mr-1" /> : <Star className="w-4 h-4 mr-1" />}
                  {isFav ? 'Quitar' : 'Agregar'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : favorites.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No hay favoritos en esta obra.</p>
      ) : (
        <table className="table-cosmos">
          <thead>
            <tr><th>Nombre</th><th>CI</th><th>Estado</th><th>Horas</th><th></th></tr>
          </thead>
          <tbody>
            {favorites.map((f) => (
              <tr key={f.id}>
                <td className="font-medium">{f.full_name}</td>
                <td>{f.ci}</td>
                <td><StatusBadge status={f.is_inside ? (f.status || 'ok') : 'outside'} /></td>
                <td>{f.hours !== null ? f.hours.toFixed(1) : '-'}</td>
                <td><Button variant="ghost" size="sm" onClick={() => toggleFavorite(f.person_id, true)}><StarOff className="w-4 h-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

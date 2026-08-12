import type { ComercialSection } from '../types';
import { fmtCurrency, fmtDayShort, fmtNumber, fmtRate } from '../format';
import { EmptyHint, Section } from './states';

/**
 * Seção Comercial: vendas fechadas pelos vendedores (leo, gabriel…), atribuídas pela UTM DO
 * CHECKOUT — o link rastreado — e cruzadas com a lista de leads de cada vendedor (aba LEADS
 * COMERCIAL) para conversão do mês. gui não aparece: o link dele é o funil do forms.
 */
export function Comercial({ data }: { data: ComercialSection }) {
  const { vendedores, vendasSemLinkRastreado, mediumsDesconhecidos, cobertura, configurado } = data;
  const semComissao = vendedores.some((v) => v.comissaoPct === null && v.vendas > 0);

  return (
    <Section
      title="Comercial (vendas por link rastreado)"
      subtitle={
        cobertura.total > 0
          ? `UTM registrada em ${cobertura.comUtm} de ${cobertura.total} vendas do período`
          : undefined
      }
    >
      <div className="card space-y-4">
        {!configurado && (
          <EmptyHint>
            Seção não configurada — cadastre os vendedores em <code>config/comercial.json</code> e
            reinicie o servidor.
          </EmptyHint>
        )}
        {configurado && (
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Vendedor</th>
                  <th className="th text-right" title="contatos na lista do vendedor no período (aba LEADS COMERCIAL)">
                    Leads na lista
                  </th>
                  <th className="th text-right" title="vendas do período com a UTM do vendedor no checkout (utm_medium)">
                    Vendas
                  </th>
                  <th className="th text-right" title="vendas ÷ leads da lista">
                    Conversão
                  </th>
                  <th className="th text-right" title="líquido Cakto — a mesma base de faturamento do resto do dashboard">
                    Faturamento
                  </th>
                  <th className="th text-right">Comissão</th>
                  <th className="th text-right" title="faturamento − comissão do vendedor">
                    Restante
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <tr key={v.slug} className="border-b border-line/50 hover:bg-panel2/50">
                    <td className="td font-medium">
                      {v.vendedor} <span className="text-xs text-muted">({v.slug})</span>
                    </td>
                    <td className="td text-right">{v.leadsLista ? fmtNumber(v.leadsLista) : '—'}</td>
                    <td className="td text-right">{v.vendas ? fmtNumber(v.vendas) : '—'}</td>
                    <td className="td text-right">{fmtRate(v.conversao)}</td>
                    <td className="td text-right">{v.faturamentoBruto ? fmtCurrency(v.faturamentoBruto, true) : '—'}</td>
                    <td className="td text-right">
                      {v.comissaoPct === null ? (
                        <span className="text-muted" title="defina comissaoPct em config/comercial.json">
                          configurar %
                        </span>
                      ) : (
                        `${fmtCurrency(v.comissaoBRL ?? 0, true)} (${v.comissaoPct}%)`
                      )}
                    </td>
                    <td className="td text-right">
                      {v.liquidoBRL === null ? '—' : fmtCurrency(v.liquidoBRL, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {semComissao && (
          <p className="text-xs text-muted">
            % de comissão ainda não configurada — o faturamento aparece cheio; defina{' '}
            <code>comissaoPct</code> em <code>config/comercial.json</code> pra ver comissão e restante.
          </p>
        )}

        {vendasSemLinkRastreado.length > 0 && (
          <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm">
            <p className="font-medium text-gold">
              ⚠ {vendasSemLinkRastreado.length} venda(s) de contato da lista SEM o link rastreado do vendedor
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {vendasSemLinkRastreado.map((a, i) => (
                <li key={i}>
                  {fmtDayShort(a.date)} · {fmtCurrency(a.valorBRL, true)} · lista do {a.vendedor} ·{' '}
                  {a.utmDaVenda ? `veio marcada como "${a.utmDaVenda}"` : 'venda sem UTM no checkout'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {mediumsDesconhecidos.length > 0 && (
          <p className="text-xs text-gold">
            ⚠ utm_source=Comercial com medium fora da config: {mediumsDesconhecidos.join(', ')} —
            vendedor novo? Cadastrar em <code>config/comercial.json</code>.
          </p>
        )}
      </div>
    </Section>
  );
}

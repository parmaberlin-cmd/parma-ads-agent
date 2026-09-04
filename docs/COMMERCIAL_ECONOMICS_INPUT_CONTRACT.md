# Commercial Economics Input Contract

The Agent may calculate break-even acquisition economics only from explicit verified inputs. It must not invent missing restaurant economics.

## Required input classes
- direct_order: average revenue, food cost, packaging, payment fee, incremental labor.
- marketplace_order: average revenue received, food cost, packaging, marketplace commission/fee, incremental labor.
- reservation: average party size, show rate, average revenue per guest, contribution-cost assumptions.
- repeat_customer: verified repeat probability and time horizon; otherwise lifetime value remains unknown.
- walk_in: may be represented as a proxy opportunity but cannot be assigned observed revenue without evidence.

## Derived metrics
- contribution value = revenue minus known incremental costs.
- break-even CPA = verified contribution value attributable to one incremental acquired outcome, adjusted only for verified show/cancellation/repeat assumptions.
- simplified LTV = first contribution plus verified expected repeat contribution over an explicit horizon.

## Fail-closed rules
If revenue, required costs, show rate, repeat rate or attribution incrementality is missing, return unknown for the dependent metric. Never replace missing inputs with industry averages silently. Benchmarks may be shown separately as scenarios, never as Parma ground truth.

Conversion volume is not customer value. A booking event is not automatically a seated party; a marketplace click is not an order; a near-me click may create an unmeasured walk-in.

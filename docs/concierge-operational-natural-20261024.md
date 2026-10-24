# Operational natural-language increment

Base: main `eeb77c3b420600d2533933911b0c24a742422274`.

The existing WhatsApp adapter invokes the shared configured Concierge engine;
Telegram and app use that same prepared reply wrapper. Existing natural date,
flight, weather and short-context parsing remains authoritative. This change
adds bounded lexical aliases, not another chat, temporal router or AI provider.

Reproduced before the change: `qual minha próxima jornada?` and `q hrs a van me
pega no hotel?` were unknown; `quando saio do hotel?` became `/saida`, potentially
entering an airport route query. Now hotel/van/APZ questions terminate through the
existing stay guard before preferences, external route queries or context writes.
Bare APZ asks which of airport presentation, hotel APZ or van departure is meant.
An explicit airport APZ aliases the existing presentation path. Van direction is
never inferred from “no hotel”; both competing directions require clarification.

Next-duty/summary/presentation aliases use the existing interpreter and canonical
calculations. Only unknown, undated interpretations are expanded, preserving the
existing temporal parser and context expiry. No roster or financial calculation
is introduced. No raw questions or account information are stored by this module.
The existing schedule wrapper may persist its minimal conversation context;
this is not a new read-only API, and the existing ask endpoint remains unsuitable
as a read-only tool without separating its writes/external queries.

No hotel reservation, pickup, company contact or waiting limit is fabricated.
The existing stay replies explicitly say what is unconfirmed. They do not read a
foreign snapshot, reuse a room or treat arrival at an airport as hotel arrival.
Nearby pharmacy/gym/hospital queries and explicit commands retain their routers.
The aliases support documented paraphrases, accents, abbreviations and selected
misspellings; this does not prove unrestricted natural understanding.

## Existing work and remaining boundaries

- #1203 contains the client offline pilot and dated account-scoped facts, but is
  still unmerged. #1207/#1208 remain separate OFF provider/classifier drafts.
  This increment neither absorbs nor activates them.
- #1135 remains a separate temporal-dialogue draft. No temporal selection,
  occurrence continuation or calculations are copied from it here.
- #938/#909/#910 remain reference-only transport/briefing work. This change does
  not treat draft reference data as confirmed operational reservations.
- The saved server snapshot timestamp can change on preference updates. It must
  not be presented as the airline's publication or refresh timestamp. A future
  facts adapter must preserve true capture/source revision, selected occurrence,
  owner/session and final freshness checks before attaching provenance to facts.
- WhatsApp needs connectivity. These lexical guards make no external lookup, but
  a server response is not client offline operation. This change does not announce
  offline app completion; activating #1203 remains a separate reviewed delivery.
- The physical single-message transport test is owned by the WhatsApp owner. A
  delivered neutral reply does not validate arbitrary operational questions with
  real roster data, nor authorize further messages, general sends or a new quota.

## Verification

Synthetic red/green regression exercises the actual interpreter and stay guard,
and the actual fully prepared shared reply wrapper. Ambiguous logistics ends
before preference handling; no route/model/history calls, writes or foreign data
reads occur on that path. Existing context expiry and date parsing are checked.
Existing stay-menu, journey, navigation, natural-language and human-voice gates
must remain intact. No credentials, network provider, policy, permissions or
transport handlers are changed. Provider activation and broader sending remain
outside this draft. Tests with mocks do not assess a real generative model.

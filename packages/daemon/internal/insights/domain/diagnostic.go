package domain

// DiagnosticPrefix heads the URN of every problem the insights configuration can report. Each
// layer of the configuration adds its own word to it, so the classifier, the rules and the files
// they are read from are told apart by a tool matching on the URN.
const DiagnosticPrefix = "urn:rrd-analyzer:insights:"

// Diagnostic follows the fields of an RFC 9457 problem so the front can show a rejected rule the
// way it shows any other failure.
type Diagnostic struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	RuleID string `json:"ruleId,omitempty"`
	Origin string `json:"origin"`
}

// DiagnosticKind is one kind of problem a configuration document can have: the URN a tool matches
// on and the title a person reads. The two are declared as a pair, once per kind, so a title can
// never drift from its URN; a URN may head several kinds, each with its own title.
type DiagnosticKind struct {
	URN   string
	Title string
}

// Raise is this kind of problem with one detail. Whoever knows which file it came from fills in
// Origin afterwards.
func (kind DiagnosticKind) Raise(detail string) Diagnostic {
	return Diagnostic{Type: kind.URN, Title: kind.Title, Detail: detail}
}

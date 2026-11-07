package main

import (
	"net"
	"net/http"
	"slices"
	"strings"
)

const (
	loopbackName        = "localhost"
	loopbackIPv4        = "127.0.0.1"
	loopbackIPv6        = "::1"
	ipv6LiteralBrackets = "[]"
	rootDomainDot       = "."
)

// allowLocalHosts refuses a request that names any host but this machine, which is what DNS
// rebinding needs: a page on a name its owner points at 127.0.0.1 is, to the browser, the same
// origin as this server, so its reads carry no Origin header for allowWebOrigins to refuse, and it
// could read every library route, the copies of the files a developer opened included. The name the
// browser resolved still arrives in Host, and that is the one part of the request such a page cannot
// choose.
//
// The host the server was told to listen on is allowed besides the loopback names, so an -address
// naming one of the machine's own addresses keeps working from it.
func allowLocalHosts(listenAddress string, next http.Handler) http.Handler {
	allowed := []string{loopbackName, loopbackIPv4, loopbackIPv6}
	if listenHost := hostnameOf(listenAddress); listenHost != "" {
		allowed = append(allowed, listenHost)
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if !slices.Contains(allowed, hostnameOf(request.Host)) {
			http.Error(writer, "this host may not call the development server", http.StatusForbidden)

			return
		}

		next.ServeHTTP(writer, request)
	})
}

// hostnameOf is the name in a host or a host:port, in lower case, without the brackets of an IPv6
// literal or the dot a fully qualified name may end with.
func hostnameOf(hostAndPort string) string {
	host, _, err := net.SplitHostPort(hostAndPort)
	if err != nil {
		host = hostAndPort
	}

	return strings.TrimSuffix(strings.ToLower(strings.Trim(host, ipv6LiteralBrackets)), rootDomainDot)
}

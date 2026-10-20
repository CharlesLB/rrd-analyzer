package main

import (
	"net/http"
	"slices"
)

// allowWebOrigins lets the development web app, and only it, call the server from a browser. A
// request from any other page is refused outright rather than only denied its CORS headers: a
// browser still sends a simple cross-origin POST and lets it run, it merely hides the answer, so
// any page the developer happened to visit could otherwise reset their development library.
// Requests with no Origin, from a terminal or a test runner, are not a browser's and pass.
func allowWebOrigins(origins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		if origin != "" && !slices.Contains(origins, origin) {
			http.Error(writer, "this origin may not call the development server", http.StatusForbidden)

			return
		}

		if origin != "" {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Vary", "Origin")
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}

		if request.Method == http.MethodOptions {
			writer.WriteHeader(http.StatusNoContent)

			return
		}

		next.ServeHTTP(writer, request)
	})
}

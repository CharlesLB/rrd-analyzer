package rules

import (
	"reflect"
	"testing"
)

const tomlTag = "toml"

func fieldTagged(documentType reflect.Type, key string) (reflect.StructField, bool) {
	for index := range documentType.NumField() {
		if field := documentType.Field(index); field.Tag.Get(tomlTag) == key {
			return field, true
		}
	}

	return reflect.StructField{}, false
}

func TestDetectorParameters_EachKey_ReadsOnlyTheFieldTaggedWithIt(t *testing.T) {
	documentType := reflect.TypeFor[conditionDocument]()

	for _, parameter := range detectorParameters {
		field, found := fieldTagged(documentType, parameter.key)
		if !found || field.Type.Kind() != reflect.Pointer {
			t.Errorf("no optional condition field is tagged %q", parameter.key)

			continue
		}

		var document conditionDocument
		reflect.ValueOf(&document).Elem().FieldByIndex(field.Index).Set(reflect.New(field.Type.Elem()))

		for _, other := range detectorParameters {
			if isSet, want := other.isSet(document), other.key == parameter.key; isSet != want {
				t.Errorf("setting %s: %s reads as set = %v, want %v", parameter.key, other.key, isSet, want)
			}
		}
	}
}

func TestDetectorParameters_EveryApplicableKey_HasADescriptor(t *testing.T) {
	described := make(map[string]bool, len(detectorParameters))
	for _, parameter := range detectorParameters {
		described[parameter.key] = true
	}

	for detector, keys := range applicableParameters {
		for _, key := range keys {
			if !described[key] {
				t.Errorf("%s applies to %s but no descriptor reads or checks it", key, detector)
			}
		}
	}
}

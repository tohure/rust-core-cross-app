cmake_minimum_required(VERSION 3.4.1)
project(CoreFinanciero)

set (CMAKE_VERBOSE_MAKEFILE ON)

add_library(
    banco-core-financiero    STATIC
    ../cpp/CoreFinancieroImpl.cpp
)

set_target_properties(
    banco-core-financiero PROPERTIES
    CXX_STANDARD 20
    CXX_STANDARD_REQUIRED ON
    CXX_EXTENSIONS OFF
)

target_include_directories(
    banco-core-financiero    PUBLIC
    ../cpp
)

target_link_libraries(
    banco-core-financiero    jsi
    reactnative
    react_codegen_CoreFinancieroSpec
)
